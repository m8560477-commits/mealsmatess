export const relationships = [
  {
    "from": "favorites",
    "column": "recipe_id",
    "to": "recipes",
    "target": "id"
  },
  {
    "from": "grocery_items",
    "column": "recipe_id",
    "to": "recipes",
    "target": "id"
  },
  {
    "from": "meal_plans",
    "column": "recipe_id",
    "to": "recipes",
    "target": "id"
  },
  {
    "from": "nutrition_logs",
    "column": "recipe_id",
    "to": "recipes",
    "target": "id"
  },
  {
    "from": "recently_viewed",
    "column": "recipe_id",
    "to": "recipes",
    "target": "id"
  },
  {
    "from": "recipe_ratings",
    "column": "recipe_id",
    "to": "recipes",
    "target": "id"
  },
  {
    "from": "restaurant_locations",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "restaurant_menus",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "menu_items",
    "column": "menu_id",
    "to": "restaurant_menus",
    "target": "id"
  },
  {
    "from": "menu_items",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "restaurant_staff",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "restaurant_orders",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "order_items",
    "column": "menu_item_id",
    "to": "menu_items",
    "target": "id"
  },
  {
    "from": "order_items",
    "column": "order_id",
    "to": "restaurant_orders",
    "target": "id"
  },
  {
    "from": "restaurant_reviews",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "posts",
    "column": "recipe_id",
    "to": "recipes",
    "target": "id"
  },
  {
    "from": "post_comments",
    "column": "post_id",
    "to": "posts",
    "target": "id"
  },
  {
    "from": "post_hashtags",
    "column": "hashtag_id",
    "to": "hashtags",
    "target": "id"
  },
  {
    "from": "post_hashtags",
    "column": "post_id",
    "to": "posts",
    "target": "id"
  },
  {
    "from": "post_likes",
    "column": "post_id",
    "to": "posts",
    "target": "id"
  },
  {
    "from": "post_saves",
    "column": "post_id",
    "to": "posts",
    "target": "id"
  },
  {
    "from": "promo_redemptions",
    "column": "code_id",
    "to": "promo_codes",
    "target": "id"
  },
  {
    "from": "user_challenges",
    "column": "challenge_id",
    "to": "challenges",
    "target": "id"
  },
  {
    "from": "restaurant_promotions",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "promotion_redemptions",
    "column": "promotion_id",
    "to": "restaurant_promotions",
    "target": "id"
  },
  {
    "from": "promotion_redemptions",
    "column": "restaurant_id",
    "to": "restaurants",
    "target": "id"
  },
  {
    "from": "promotion_redemptions",
    "column": "order_id",
    "to": "restaurant_orders",
    "target": "id"
  },
  {
    "from": "menu_items",
    "column": "branch_id",
    "to": "restaurant_locations",
    "target": "id"
  },
  {
    "from": "restaurant_orders",
    "column": "branch_id",
    "to": "restaurant_locations",
    "target": "id"
  },
  {
    "from": "subscription_events",
    "column": "subscription_id",
    "to": "subscriptions",
    "target": "id"
  }
] as const;
