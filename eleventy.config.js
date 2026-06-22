module.exports = function (eleventyConfig) {
  // Static assets copied as-is to the output
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/js");

  // Shared dependency-map stylesheet (raw CSS, not part of the Tailwind
  // pipeline — main.css is compiled separately via the Tailwind CLI).
  eleventyConfig.addPassthroughCopy("src/css/dependency-map.css");

  // Dependency-map and live-reference pages across all projects are
  // standalone hand-written HTML (separate design system per tool, no
  // shared header/footer) — copy verbatim rather than running through
  // the Eleventy/Nunjucks templating pipeline.
  eleventyConfig.addPassthroughCopy("src/blendviewer/dependency-map");
  eleventyConfig.addPassthroughCopy("src/blendviewer/live-reference");
  eleventyConfig.addPassthroughCopy("src/firestack/dependency-map");
  eleventyConfig.addPassthroughCopy("src/matrix-calculator/dependency-map");
  eleventyConfig.addPassthroughCopy("src/python-video-downloader/dependency-map");
  eleventyConfig.addPassthroughCopy("src/youtube-video-downloader/dependency-map");
  eleventyConfig.addPassthroughCopy("src/social-media-website/dependency-map");
  eleventyConfig.addPassthroughCopy("src/social-media-website/live-reference/assets");

  // Custom domain support for GitHub Pages
  eleventyConfig.addPassthroughCopy("src/CNAME");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
