import React, { useState } from 'react';
import { CUSTOMER_CHARACTER, getCustomerAvatar, smallCharacter, type PersonPhoto } from '../lib/personAvatar';

const CHARACTER_SCALE = 1.15;

/** The character is a bust, scaled past the circle so its shoulders run off the frame. */
const CustomerAvatar: React.FC<{ customer?: PersonPhoto | null; size?: number }> = ({ customer, size = 28 }) => {
  const src = getCustomerAvatar(customer);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = src === failedSrc ? CUSTOMER_CHARACTER : src;
  const isCharacter = shown === CUSTOMER_CHARACTER;

  return (
    <span aria-hidden="true" className="hc-customer-avatar" style={{ width: size, height: size }}>
      <img
        src={shown}
        srcSet={isCharacter ? `${smallCharacter(CUSTOMER_CHARACTER)} 256w, ${CUSTOMER_CHARACTER} 512w` : undefined}
        sizes={isCharacter ? `${Math.ceil(size * CHARACTER_SCALE)}px` : undefined}
        alt=""
        loading="lazy"
        onError={() => setFailedSrc(shown)}
        className={isCharacter ? 'is-character' : undefined}
      />
    </span>
  );
};

export default CustomerAvatar;
