export default {
  show: ({ text1, text2 }: any) => window.alert([text1, text2].filter(Boolean).join('\n')),
};
