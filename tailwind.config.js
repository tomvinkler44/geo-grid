/** Scans the app's markup and JS string literals for class names. */
export default {
  content: ['./public/**/*.html', './public/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
};
