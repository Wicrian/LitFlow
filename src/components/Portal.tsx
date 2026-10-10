import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Affiche une fenêtre flottante directement dans la page. Sinon, le flou du cadre
 * (backdrop-filter) la positionnerait par rapport au cadre et non à l'écran.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
