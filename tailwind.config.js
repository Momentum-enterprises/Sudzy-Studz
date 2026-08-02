export default {
  content: [
    './index.html',
    './pricing/index.html',
    './privacy-policy/index.html',
    './refund-policy/index.html',
    './terms-of-service/index.html',
    './book/index.html',
    './book/showroom/index.html',
    './book/quick-studz/index.html',
    './book/full-studz/index.html',
    './book/essentials-studz/index.html',
  ],
  theme: {
    extend: {
      colors: {
        ink:    '#0B2830',
        deep:   '#0C3F4E',
        teal:   '#0C9FE4',
        aqua:   '#2CC6F0',
        foam:   '#D4EEFB',
        cream:  '#F6F1E7',
        paper:  '#FBF8F1',
        coral:  '#0C9FE4',
        sun:    '#F2B844',
        card:              '#171717',
        'card-foreground': '#ffffff',
        'muted-foreground':'#a3a3a3',
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
