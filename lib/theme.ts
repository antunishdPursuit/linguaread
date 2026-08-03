import sourceSansUrl from '@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url';
import sourceSerifUrl from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url';
import './theme.css';

const fontStyle = document.createElement('style');

// LinguaRead's interface is English-first. Bundle only the Latin variable
// subsets; PDF text remains untouched and Mandarin keeps its system fallback.
fontStyle.textContent = `
  @font-face {
    font-family: "Source Sans 3 Variable";
    font-style: normal;
    font-display: swap;
    font-weight: 200 900;
    src: url("${sourceSansUrl}") format("woff2-variations");
  }

  @font-face {
    font-family: "Source Serif 4 Variable";
    font-style: normal;
    font-display: swap;
    font-weight: 200 900;
    src: url("${sourceSerifUrl}") format("woff2-variations");
  }
`;

document.head.append(fontStyle);
