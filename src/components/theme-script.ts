// Shared constants: safe to import from the root server layout and client controls.
export const THEME_KEY = "two-words-theme";
// Apply the stored/system appearance before content paints. No user text is interpolated.
export const THEME_BOOTSTRAP = `(()=>{let t;try{t=localStorage.getItem('${THEME_KEY}')}catch{}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t})()`;
