export const SUPPORT_EMAIL = "support@mealsmates.site";
export const CONTACT_EMAIL = "contact@mealsmates.site";
export const CONTACT_EMAIL_URL = `mailto:${CONTACT_EMAIL}?subject=MealMate%20general%20enquiry`;
export const SUPPORT_EMAIL_URL = `mailto:${SUPPORT_EMAIL}?subject=MealMate%20support%20request`;

type HelpLink = {
  label: string;
  to:
    | "/auth"
    | "/scan"
    | "/cookbook"
    | "/chat"
    | "/pantry"
    | "/planner"
    | "/grocery"
    | "/premium"
    | "/profile"
    | "/orders";
};
type HelpTopic = {
  id: string;
  question: string;
  answer: string;
  matches: RegExp[];
  links: HelpLink[];
};

/** Answers describe the app's existing screens; Kai cannot read or change an account. */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "cancel",
    question: "How do I cancel my subscription?",
    answer:
      "Cancel through the store where you purchased the subscription. For Google Play, open Play Store → your profile → Payments & subscriptions → Subscriptions → MealMate. Uninstalling the app does not cancel billing. Access continues until the end of the paid period. For a refund or a payment dispute, contact the store or email our team; Kai cannot cancel or refund a payment.",
    matches: [
      /\bcancel\w*\b/,
      /\bunsubscribe\b/,
      /\brefund\b/,
      /\bstop\b.*\b(?:billing|payment|subscription|charging)\b/,
    ],
    links: [{ label: "Open Premium", to: "/premium" }],
  },
  {
    id: "password",
    question: "I forgot my password",
    answer:
      "On the sign-in page, enter your account email, then tap Forgot password. Open the reset link in your inbox; check spam if it is missing. In Settings, Change password also sends a reset email. If you signed up with Google, choose Continue with Google instead. If the email still does not arrive, email the support team from your account email.",
    matches: [/\bpassword\b/, /\breset\b/, /\bforgot(?:ten)?\b/],
    links: [{ label: "Open sign-in", to: "/auth" }],
  },
  {
    id: "theme",
    question: "How do I change my theme?",
    answer:
      "Open Settings to choose light, dark or system mode. The Theme picker changes your color palette and mascot; colored themes require Premium. Your selected color also appears on the login and welcome pages. Sign in to save the selection to your account. If saving fails, the app restores the previous theme; check your connection and try again.",
    matches: [
      /\btheme\w*\b/,
      /\bcolou?r\w*\b/,
      /\b(?:dark|light)\s*(?:mode)?\b/,
      /\bmascot\b/,
      /\bappearance\b/,
    ],
    links: [{ label: "Open Settings", to: "/profile" }],
  },
  {
    id: "signin",
    question: "I can't sign in",
    answer:
      "Use the same sign-in method you used to create your account: email and password, or Continue with Google. If MealMate asks you to verify your email, open the link in your inbox, then tap I've verified my email. Check spam or use Resend verification email if needed. You can use Kai and email support without signing in.",
    matches: [
      /\bsign\s*(?:in|up)\b/,
      /\blog\s*in\b/,
      /\blogin\b/,
      /\bverif\w*\b/,
      /\b(?:email|account)\b.*\b(?:access|locked|wrong|work|problem|issue)\b/,
    ],
    links: [{ label: "Open sign-in", to: "/auth" }],
  },
  {
    id: "restore",
    question: "I paid, but Premium is missing",
    answer:
      "Sign in to the original MealMate account used for the purchase. In the Android app, open MealMate Premium and choose Restore purchases. Use the Google Play account that made the purchase. If access is still missing, email the team with your store order reference so they can investigate. Kai cannot check payments or activate Premium.",
    matches: [
      /\brestor(?:e|ing)\b/,
      /\b(?:paid|purchased|bought|charged)\b/,
      /\bpremium\b.*\b(?:missing|locked|not working|lost)\b/,
    ],
    links: [{ label: "Open Premium", to: "/premium" }],
  },
  {
    id: "scan",
    question: "How do I scan food?",
    answer:
      "Open Food Scanner from AI Chef. Choose Identify dish for a plated meal and estimated calories/macros, or Log ingredients for groceries and pantry items. Take a photo or choose one from your gallery. Use a clear, well-lit photo. For a dish, choose a date and meal type, then Add to planner. For ingredients, tap Add all to pantry. If a scan fails or finds nothing, choose another photo and try again. Scanning needs sign-in, an internet connection and available AI allowance.",
    matches: [
      /\bscan\w*\b/,
      /\bcamera\b/,
      /\b(?:photo|picture|image)\w*\b/,
      /\b(?:calories|macros|nutrition)\b/,
    ],
    links: [{ label: "Open Food Scanner", to: "/scan" }],
  },
  {
    id: "recipes",
    question: "Where are my saved recipes?",
    answer:
      "Open a recipe and tap Save (the heart) to keep it in your Cookbook. Open Cookbook to find saved recipes. Make sure you are signed in to the same MealMate account if a saved recipe seems to be missing.",
    matches: [
      /\b(?:sav\w*|missing|lost|find|where)\b.*\brecipes?\b/,
      /\brecipes?\b.*\b(?:sav\w*|missing|lost)\b/,
      /\bcookbook\b/,
      /\bfavou?rites?\b/,
      /\bheart\b/,
    ],
    links: [{ label: "Open Cookbook", to: "/cookbook" }],
  },
  {
    id: "ai",
    question: "How do I use AI Chef?",
    answer:
      "Open AI Chef and tell Mia what you want to cook, which ingredients you have, and any dietary preferences. Mia helps with cooking and recipes; Kai helps with the app. AI features need a connection and are subject to your plan's allowance. If you hit an allowance limit, follow the reset information in the message or check Premium. If a request fails, try again when your connection is stable.",
    matches: [
      /\b(?:mia|chef|generate|generator|ai|credits?|allowance|limits?)\b/,
      /\brecipe\w*\b/,
      /\b(?:offline|internet|connection)\b/,
    ],
    links: [
      { label: "Open AI Chef", to: "/chat" },
      { label: "Open Premium", to: "/premium" },
    ],
  },
  {
    id: "pantry",
    question: "How do I manage my pantry?",
    answer:
      "Open Pantry from AI Chef to add or remove ingredients and edit quantities. You can also use Food Scanner → Log ingredients, then Add all to pantry. If saving fails, check your connection and sign-in, then retry; Kai cannot view or edit your pantry.",
    matches: [/\bpantry\b/, /\bingredient\w*\b/, /\bfridge\b/],
    links: [{ label: "Open Pantry", to: "/pantry" }],
  },
  {
    id: "planner",
    question: "How do I plan meals and build a shopping list?",
    answer:
      "Open Planner, choose a day and meal type, and add a meal. The planner can also generate a plan and build a grocery list. Open Grocery to review your shopping items. A scanned dish can be added to Planner from its scan result.",
    matches: [
      /\b(?:planner|planning)\b/,
      /\bplan\s+(?:a |my |the |some )?(?:meals?|week|dinner|breakfast|lunch)\b/,
      /\bgrocer\w*\b/,
      /\bshopping\b/,
      /\bmeal\s*prep\b/,
    ],
    links: [
      { label: "Open Planner", to: "/planner" },
      { label: "Open Grocery", to: "/grocery" },
    ],
  },
  {
    id: "premium",
    question: "How do I get Premium?",
    answer:
      "Open MealMate Premium from Settings to see plans. In the Android app, available store offers and their actual price appear before purchase. Trials depend on store eligibility and the terms shown at checkout. If no offers are available, email the team; Kai cannot create an offer, apply a payment or grant Premium access.",
    matches: [/\b(?:premium|upgrade|subscribe|subscription|trial|pricing|price|cost|plan)\b/],
    links: [{ label: "Open Premium", to: "/premium" }],
  },
  {
    id: "codes",
    question: "Where do I enter a promo or referral code?",
    answer:
      "Open MealMate Premium. Enter a promo code under Redeem a code, or use the referral section for referral codes and sharing your own. The app confirms whether a code is accepted. If it is rejected, check the spelling and email support with the code and error message. Kai cannot validate a code or promise a reward.",
    matches: [/\b(?:promo|coupon|voucher|redeem|referral|refer|reward|code)\w*\b/],
    links: [{ label: "Open Premium", to: "/premium" }],
  },
  {
    id: "notifications",
    question: "How do I change notifications?",
    answer:
      "In Settings, use Push notifications to enable or disable notifications on this device. If permission was blocked, update notification permissions in your browser or device settings first. The Notification center contains your account's notices.",
    matches: [/\bnotif\w*\b/, /\bpush\b/, /\balerts?\b/],
    links: [{ label: "Open Settings", to: "/profile" }],
  },
  {
    id: "delete",
    question: "How do I delete my account?",
    answer: `Email ${SUPPORT_EMAIL} from your account email to request deletion of your account and data. Our stated deletion timeframe is within 7 days. Kai cannot delete accounts or confirm that a deletion request has been received.`,
    matches: [
      /\b(?:delete|deletion|erase|remove|close)\b.*\b(?:account|data|profile)\b/,
      /\bprivacy\b/,
    ],
    links: [],
  },
  {
    id: "orders",
    question: "I need help with an order",
    answer:
      "Open My orders to check the order's current status and details. For an order-specific problem, email support with your order reference and what went wrong. Kai cannot view orders, contact the restaurant or change an order.",
    matches: [/\b(?:orders?|delivery|deliveries|restaurant|takeaway|pickup)\b/],
    links: [{ label: "Open My orders", to: "/orders" }],
  },
];

export type KaiReply = { text: string; topicId?: string; links: HelpLink[]; email?: boolean };

export function answerSupportQuestion(question: string, previousTopic?: string): KaiReply {
  const normalized = question
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const topic = /\bcancel\w*\b.*\border\w*\b|\border\w*\b.*\bcancel\w*\b/.test(normalized)
    ? HELP_TOPICS.find((item) => item.id === "orders")
    : HELP_TOPICS.find((item) => item.matches.some((pattern) => pattern.test(normalized)));
  if (
    /\b(?:human|person|agent|team)\b|\b(?:email|contact)(?: our| the| your)? support\b/.test(
      normalized,
    ) ||
    (!topic && /\b(?:email|contact)\b/.test(normalized))
  ) {
    return {
      text: `You can email our team at ${SUPPORT_EMAIL}. Describe what happened and include the relevant order or purchase reference if you have one. The email button opens a draft in your email app; Kai does not send messages or create tickets.`,
      links: [],
      email: true,
    };
  }
  if (
    /\b(?:still|didnt|doesnt|not working|tried|failed|same problem|did not|does not)\b/.test(
      normalized,
    ) &&
    previousTopic &&
    (!topic || topic.id === previousTopic)
  ) {
    return {
      text: "Sorry that didn't solve it. Email the team with what you tried and the exact error message. You can use Email this conversation to include your recent messages in the draft. Kai can't inspect your account or check service status.",
      links: [],
      topicId: previousTopic,
      email: true,
    };
  }
  if (topic)
    return {
      text: topic.answer,
      topicId: topic.id,
      links: topic.links,
      email: ["restore", "cancel", "delete", "orders"].includes(topic.id),
    };
  if (/^(?:hi|hello|hey|help|kai)(?: kai)?$/.test(normalized)) {
    return {
      text: "Hi! I'm Kai, your automated MealMate support assistant. Ask about sign-in, food scans, recipes, themes, meal planning or Premium, or choose a question below.",
      links: [],
    };
  }
  if (/\b(?:thanks|thank you|cheers)\b/.test(normalized)) {
    return {
      text: "You're welcome! Is there anything else in MealMate I can help with?",
      links: [],
    };
  }
  return {
    text: "I don't have a reliable answer to that yet. Tell me which part of MealMate you need help with, or choose a question below. For anything specific to your account, email our support team.",
    links: [],
    email: true,
  };
}

/** A user-triggered email draft; no background email sending or chat persistence. */
export function supportConversationEmail(messages: { role: "user" | "assistant"; text: string }[]) {
  const recent = messages
    .slice(-8)
    .map((message) => `${message.role === "user" ? "You" : "Kai"}: ${message.text}`)
    .join("\n\n");
  const characters = Array.from(recent);
  const excerpt =
    characters.length > 2000
      ? `[Earlier messages omitted]\n${characters.slice(-2000).join("")}`
      : recent;
  const body = `Hi MealMate support,\n\nI need help with:\n\n\nRecent conversation with Kai:\n${excerpt}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("MealMate support — Kai conversation")}&body=${encodeURIComponent(body)}`;
}
