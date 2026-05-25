export default {
  setString: (value: string) => navigator.clipboard?.writeText(value),
  getString: () => navigator.clipboard?.readText?.() || Promise.resolve(''),
};
