function cleanCasText(rawText) {
  if (!rawText) return "";

  let text = String(rawText);

  const removablePatterns = [
    /page\s+\d+\s+of\s+\d+/gi,
    /consolidated account statement/gi,
    /this is a computer generated statement/gi,
    /investments in mutual fund are subject to market risks/gi,
    /registrar and transfer agent.*$/gim,
    /contact us.*$/gim
  ];

  removablePatterns.forEach((pattern) => {
    text = text.replace(pattern, " ");
  });

  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = {
  cleanCasText
};
