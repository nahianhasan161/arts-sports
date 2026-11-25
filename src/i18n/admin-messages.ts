import { addMessages } from "./index";
import { adminBn } from "./messages/admin.bn";
import { adminEn } from "./messages/admin.en";
import { shopBn } from "./messages/shop.bn";
import { shopEn } from "./messages/shop.en";

/**
 * The `shop.*` and `admin.*` text (about 140 KB). Customers never need it, so
 * it is not part of the main dictionary: import this file for its side effect
 * in whatever shows such text. The admin layout does, for all of /admin.
 */
addMessages("bn", { shop: shopBn, admin: adminBn });
addMessages("en", { shop: shopEn, admin: adminEn });
