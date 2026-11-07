import { updateProfile } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateProfileImage(file: File) {
  if (!IMAGE_TYPES.has(file.type)) throw new Error("Choose a JPG, PNG or WEBP image.");
  if (!file.size || file.size > MAX_PROFILE_IMAGE_BYTES)
    throw new Error("Choose an image no larger than 5 MB.");
}

export type PhotoCrop = { zoom: number; x: number; y: number };
export function cropGeometry(width: number, height: number, crop: PhotoCrop) {
  const side = Math.min(width, height) / crop.zoom;
  return { side, left: ((width - side) * crop.x) / 100, top: ((height - side) * crop.y) / 100 };
}

/** Browser decoding honours EXIF orientation, including phone camera portraits. */
export async function compressProfileImage(source: HTMLImageElement, crop: PhotoCrop) {
  const { side, left, top } = cropGeometry(source.naturalWidth, source.naturalHeight, crop);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(768, Math.round(side));
  const context = canvas.getContext("2d");
  if (!context || !canvas.width) throw new Error("This device couldn’t process the image.");
  context.fillStyle = "#101625";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, left, top, side, side, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Couldn’t compress the image."))),
      "image/jpeg",
      0.85,
    ),
  );
  if (blob.size > MAX_PROFILE_IMAGE_BYTES) throw new Error("The processed image is too large.");
  return blob;
}

async function currentPhotoUser(uid: string) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error("Your session has expired. Sign in again.");
  await user.getIdToken();
  return user;
}

async function savePhotoReference(uid: string, photoURL: string) {
  const user = await currentPhotoUser(uid);
  // updateDoc deliberately requires the existing account; never create a second profile.
  await updateDoc(doc(db, "users", uid), { photoURL, photoUpdatedAt: serverTimestamp() });
  try {
    // Empty string clears the photo across SDK/emulator versions; Auth normalizes it to null.
    await updateProfile(user, { photoURL });
    return { authSynced: true };
  } catch {
    // Firestore is authoritative. The live avatar listener retries Auth synchronization.
    return { authSynced: false };
  }
}

export async function uploadProfilePhoto(
  uid: string,
  image: Blob,
  progress: (value: number) => void,
) {
  await currentPhotoUser(uid);
  if (image.type !== "image/jpeg" || !image.size || image.size > MAX_PROFILE_IMAGE_BYTES)
    throw new Error("Choose a valid image no larger than 5 MB.");
  const destination = ref(storage, `users/${uid}/profile/avatar.jpg`);
  // Resumable uploads replace the object only on completion; never delete the old photo first.
  const task = uploadBytesResumable(destination, image, {
    contentType: "image/jpeg",
    cacheControl: "private,max-age=0,must-revalidate",
  });
  await new Promise<void>((resolve, reject) => {
    const stopAuth = auth.onAuthStateChanged((user) => {
      if (!user || user.uid !== uid) task.cancel();
    });
    task.on(
      "state_changed",
      (snapshot) => progress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      (error) => {
        stopAuth();
        reject(error);
      },
      () => {
        stopAuth();
        resolve();
      },
    );
  });
  const url = await getDownloadURL(destination);
  // A revision prevents stale browser/CDN images when replacing the same Storage path.
  const photoURL = `${url}${url.includes("?") ? "&" : "?"}v=${crypto.randomUUID()}`;
  return { photoURL, ...(await savePhotoReference(uid, photoURL)) };
}

export async function removeProfilePhoto(uid: string) {
  await currentPhotoUser(uid);
  try {
    await deleteObject(ref(storage, `users/${uid}/profile/avatar.jpg`));
  } catch (error) {
    if ((error as { code?: string }).code !== "storage/object-not-found") throw error;
  }
  return savePhotoReference(uid, "");
}

export function profilePhotoError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (
    code &&
    /unauthenticated|unauthorized|permission-denied|user-token-expired|invalid-user-token|user-disabled/.test(
      code,
    )
  )
    return "Your session or upload permission has expired. Sign in again and retry.";
  if (code === "storage/canceled") return "Upload cancelled. Sign in again if your session ended.";
  if (code) return "Couldn’t save your photo. Check your connection and retry.";
  return error instanceof Error ? error.message : "Couldn’t save your photo. Please retry.";
}
