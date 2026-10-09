// Version test : construite avec VITE_LITFLOW_TEST=1 et publiée sous /test/.
// Elle range tout dans des tiroirs séparés pour ne jamais toucher aux revues
// de la version officielle (même site, donc même navigateur).
export const IS_TEST = import.meta.env.VITE_LITFLOW_TEST === '1';
/** Préfixe des clés de stockage du navigateur. */
export const NS = IS_TEST ? 'litflow-test' : 'litflow';
