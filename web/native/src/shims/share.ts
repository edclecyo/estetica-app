export default {
  open: async (options: any) => {
    if (navigator.share) await navigator.share({ title: options?.title, text: options?.message, url: options?.url });
    return {};
  },
};
