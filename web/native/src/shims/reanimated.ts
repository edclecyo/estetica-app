export const Easing = { linear: (t: number) => t, out: (fn: any) => fn, exp: (t: number) => t };
export const FadeIn = {};
export const FadeOut = {};
export const Layout = {};
export const SlideInRight = {};
export const SlideOutLeft = {};
export function useSharedValue(value: any) { return { value }; }
export function useAnimatedStyle(fn: any) { return fn?.() || {}; }
export function withTiming(value: any) { return value; }
export function withSpring(value: any) { return value; }
export function runOnJS(fn: any) { return fn; }
export function interpolate(value: any) { return value; }
export default {
  View: 'div',
  Text: 'span',
  createAnimatedComponent: (component: any) => component,
};
