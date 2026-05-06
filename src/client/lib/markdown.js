import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/common";

export const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch {
        return "";
      }
    }
    return hljs.highlightAuto(str).value;
  }
});
