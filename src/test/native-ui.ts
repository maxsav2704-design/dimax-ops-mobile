import { vi } from "vitest";

// Native host primitives for screen tests; application components remain real.
export async function createNativeUiMock() {
  const React = await vi.importActual<typeof import("react")>("react");
  const flatten = (style: any): any => Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten)) : style || {};
  const host = (name: string) => React.forwardRef((props: any, ref) => React.createElement(name, { ...props, ref }));
  class Value {
    listeners = new Map<string, (state: { value: number }) => void>();
    constructor(public value: number) {}
    setValue(value: number) { this.value = value; this.listeners.forEach((listener) => listener({ value })); }
    interpolate() { return this; }
    addListener(listener: (state: { value: number }) => void) { const id = String(this.listeners.size + 1); this.listeners.set(id, listener); return id; }
    removeListener(id: string) { this.listeners.delete(id); }
  }
  return {
    Pressable: host("pressable"), View: host("view"), ScrollView: host("scroll"),
    Text: "text", TextInput: "input", Image: "image", StatusBar: "statusbar",
    Modal: "modal", KeyboardAvoidingView: "keyboard-view", ActivityIndicator: "spinner", Platform: { OS: "android" },
    RefreshControl: "refresh-control", AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
    StyleSheet: { create: (value: unknown) => value, flatten, absoluteFillObject: {} },
    Animated: {
      Value, View: "animated-view", ScrollView: host("scroll"), createAnimatedComponent: (component: unknown) => component,
      event: () => vi.fn(),
      timing: (value: Value, options: { toValue: number }) => ({
        start: (done?: (result: { finished: boolean }) => void) => { value.setValue(options.toValue); done?.({ finished: true }); }, stop: vi.fn(),
      }),
      spring: (value: Value, options: { toValue: number }) => ({ start: () => value.setValue(options.toValue), stop: vi.fn() }),
      sequence: (animations: Array<{ start: () => void; stop: () => void }>) => ({
        start: () => animations.forEach((animation) => animation.start()), stop: () => animations.forEach((animation) => animation.stop()),
      }),
      loop: (animation: { start: () => void; stop: () => void }) => animation,
    },
    Easing: { out: (value: unknown) => value, inOut: (value: unknown) => value, cubic: "cubic", quad: "quad" },
  };
}
