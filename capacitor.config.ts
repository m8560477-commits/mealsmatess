import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.taztechnologies.mealmate",
  appName: "MealMate",
  webDir: "www",
  server: {
    // Load the live published app so auth, AI, photos and subscriptions all work
    url: "https://mealsmatess.lovable.app",
    androidScheme: "https",
  },
};

export default config;
