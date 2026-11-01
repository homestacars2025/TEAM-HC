export interface PersonPhoto {
  avatar_url?: string | null;
}

const AVATAR_DIR = `${process.env.PUBLIC_URL ?? ''}/avatars`;

export const CUSTOMER_CHARACTER = `${AVATAR_DIR}/customer.webp`;

/** The 256px export of a character, for `srcSet`. */
export const smallCharacter = (character: string): string => character.replace(/\.webp$/, '-256.webp');

/**
 * A customer's own photo if they have one, otherwise the customer character.
 * `customers` has no photo column yet, so today this is always the character.
 */
export function getCustomerAvatar(customer?: PersonPhoto | null): string {
  return customer?.avatar_url || CUSTOMER_CHARACTER;
}
