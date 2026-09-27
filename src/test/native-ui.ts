import { vi } from "vitest";

// Native host primitives for screen tests; application components remain real.
export async function createNativeUiMock() {
  const React = await vi.importActual<typeof import("react")>("react");
  const flatten = (style: any): any => Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten)) : style || {};
  const host = (name: string) => React.forwardRef((props: any, ref) => React.createElement(name, { ...props, ref }));
  class Value {
    constructor(public value: number) {}
    setValue(value: number) { this.value = value; }
    interpolate() { return this; }
  }
  return {
    Pressable: host("pressable"), View: host("view"), ScrollView: host("scroll"),
    Text: "text", TextInput: "input", Image: "image", StatusBar: "statusbar",
    Modal: "modal", ActivityIndicator: "spinner", Platform: { OS: "android" },
    RefreshControl: "refresh-control", AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
    StyleSheet: { create: (value: unknown) => value, flatten, absoluteFillObject: {} },
    Easing: { out: (value: unknown) => value, cubic: "cubic" },
    Animated: {
      Value, View: "animated-view", createAnimatedComponent: (component: unknown) => component,
      timing: (value: Value, options: { toValue: number }) => ({ start: () => value.setValue(options.toValue), stop: vi.fn() }),
    },
  };
}
