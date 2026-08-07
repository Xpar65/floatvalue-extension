/**
 * The most a buyer can spend on a single Steam Community Market purchase, in USD.
 *
 * Prices above this are not transactable on Steam, so the graph caps its y-axis here rather than
 * letting an unreachable outlier — a curve tail or a stray listing — compress the range a user can
 * actually trade in. This is a marketplace rule, not a display preference: it is expressed in USD
 * and applied *before* the display-currency multiply, so every locale caps at the same real limit.
 */
export const STEAM_MAX_PLOT_PRICE_USD = 2000;
