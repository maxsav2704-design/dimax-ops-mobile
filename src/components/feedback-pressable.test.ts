import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  reduced: false,
  listener: null as null | ((value: boolean) => void),
  remove: vi.fn(),
  timing: vi.fn(),
  spring: vi.fn(),
  stop: vi.fn(),
  push: vi.fn(),
  loadJournals: vi.fn(),
  prepareJournal: vi.fn(),
}));

vi.mock("react-native", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const flatten = (style: any): any => Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten)) : style || {};
  const Pressable = React.forwardRef((props: any, ref) => React.createElement("pressable", { ...props, ref }));
  class Value {
    value: number;
    listeners = new Map<string, (state: { value: number }) => void>();
    constructor(value: number) { this.value = value; }
    setValue(value: number) { this.value = value; this.listeners.forEach((listener) => listener({ value })); }
    interpolate() { return this; }
    addListener(listener: (state: { value: number }) => void) { const id = String(this.listeners.size + 1); this.listeners.set(id, listener); return id; }
    removeListener(id: string) { this.listeners.delete(id); }
  }
  return {
    Pressable, View: "view", Text: "text", Modal: "modal", ActivityIndicator: "spinner", Platform: { OS: "android" },
    ScrollView: "scroll", RefreshControl: "refresh", StatusBar: "statusbar",
    AppState: { addEventListener: () => ({ remove: vi.fn() }) },
    StyleSheet: { create: (value: unknown) => value, flatten, absoluteFillObject: {} },
    Easing: { out: (value: unknown) => value, inOut: (value: unknown) => value, cubic: "cubic", quad: "quad" },
    Animated: {
      Value, View: "animated-view", createAnimatedComponent: (component: unknown) => component,
      timing: (value: Value, options: { toValue: number }) => {
        native.timing(options);
        return { start: (done?: (result: { finished: boolean }) => void) => { value.setValue(options.toValue); done?.({ finished: true }); }, stop: native.stop };
      },
      spring: (value: Value, options: { toValue: number }) => {
        native.spring(options);
        return { start: () => value.setValue(options.toValue), stop: native.stop };
      },
      sequence: (animations: Array<{ start: () => void; stop: () => void }>) => ({
        start: () => animations.forEach((animation) => animation.start()), stop: () => animations.forEach((animation) => animation.stop()),
      }),
      loop: (animation: { start: () => void; stop: () => void }) => animation,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(native.reduced),
      addEventListener: (_event: string, listener: (value: boolean) => void) => {
        native.listener = listener;
        return { remove: native.remove };
      },
    },
  };
});
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));
vi.mock("expo-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return { useRouter: () => ({ push: native.push }), useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]) };
});
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: "ru" }), useAuth: () => ({ user: { id: "installer-a", company_id: "company-a" }, syncVersion: 0 }) }));
vi.mock("@/modules/journal/service", () => ({ loadInstallerJournals: native.loadJournals, prepareInstallerJournal: native.prepareJournal }));
vi.mock("@/modules/journal/workspace", () => ({ loadJournalWorkspace: async () => {
  const result = await native.loadJournals();
  return { ...result, data: { projects: [{ id: "project-a", name: "Project A", address: "Address A", installedLocally: 1 }], journals: result.data, localUnavailable: false } };
} }));
vi.mock("@/modules/projects/repository", () => ({
  listProjects: async () => [{ id: "project-a", name: "Project A", address: "Address A" }],
  listProjectDoors: async () => [{ status: "INSTALLED" }],
}));

import { FeedbackPressable } from "./feedback-pressable";
import { AnimatedNumber } from "./mobile-ui";
import { AnimatedFill, MotionProvider, Pop, Pulse, Reveal } from "./motion";
import { ActionButton, BrandText, ConfirmDialog, IconButton, MetricTile, SegmentedControl } from "./mobile-ui";
import JournalScreen from "../../app/journal";

let tree: ReactTestRenderer;
const event = {} as never;
const button = () => tree.root.findAllByType("pressable" as never)[0];
const flatten = (value: any): any => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value || {};

async function mount(element: React.ReactElement) {
  await act(async () => {
    tree = create(React.createElement(MotionProvider, null, element), {
      createNodeMock: () => ({ nativeTarget: true }),
    });
  });
}

beforeEach(() => { vi.clearAllMocks(); native.reduced = false; native.listener = null; });
afterEach(() => { if (tree) act(() => tree.unmount()); });

describe("shared mobile interaction", () => {
  it("animates down/up without invoking the action until release", async () => {
    const onPress = vi.fn();
    const onPressIn = vi.fn();
    const onPressOut = vi.fn();
    await mount(React.createElement(FeedbackPressable, { onPress, onPressIn, onPressOut }));
    act(() => button().props.onPressIn(event));
    expect(onPress).not.toHaveBeenCalled();
    expect(onPressIn).toHaveBeenCalledOnce();
    expect(native.timing).toHaveBeenLastCalledWith(expect.objectContaining({ toValue: 0.975, useNativeDriver: true }));
    act(() => { button().props.onPressOut(event); button().props.onPress(event); });
    expect(onPress).toHaveBeenCalledOnce();
    expect(onPressOut).toHaveBeenCalledOnce();
    expect(native.timing).toHaveBeenLastCalledWith(expect.objectContaining({ toValue: 1 }));
  });

  it("cancelled presses never invoke an action", async () => {
    const onPress = vi.fn();
    await mount(React.createElement(FeedbackPressable, { onPress }));
    act(() => button().props.onPressIn(event));
    act(() => button().props.onPressOut(event));
    expect(onPress).not.toHaveBeenCalled();
    expect(flatten(button().props.style).opacity).toBeUndefined();
  });

  it.each([{ disabled: true }, { accessibilityState: { busy: true } }, { accessibilityState: { disabled: true } }])(
    "blocks unavailable controls: %j", async (blocked) => {
      const onPress = vi.fn();
      await mount(React.createElement(FeedbackPressable, { ...blocked, onPress }));
      act(() => { button().props.onPressIn(event); button().props.onPress(event); });
      expect(onPress).not.toHaveBeenCalled();
      expect(button().props.disabled).toBe(true);
      expect(native.timing.mock.calls.some(([options]) => options.toValue < 1)).toBe(false);
    },
  );

  it("preserves native refs, style callbacks, hit targets and transforms", async () => {
    const ref = React.createRef<any>();
    await mount(React.createElement(FeedbackPressable, {
      ref, hitSlop: 8, style: ({ pressed }) => ({ minHeight: 44, backgroundColor: pressed ? "gold" : "black", transform: [{ rotate: "5deg" }] }),
    }));
    act(() => button().props.onPressIn(event));
    const style = flatten(button().props.style);
    expect(ref.current).toEqual({ nativeTarget: true });
    expect(button().props.hitSlop).toBe(8);
    expect(style.minHeight).toBe(44);
    expect(style.backgroundColor).toBe("gold");
    expect(style.transform[0]).toEqual({ rotate: "5deg" });
  });

  it("reduced motion keeps visible feedback but disables transforms", async () => {
    native.reduced = true;
    await mount(React.createElement(FeedbackPressable));
    act(() => button().props.onPressIn(event));
    expect(flatten(button().props.style).opacity).toBeLessThan(1);
    expect(flatten(button().props.style).transform).toBeUndefined();
    expect(native.timing).not.toHaveBeenCalled();
  });

  it("responds to live accessibility changes and releases its one subscription", async () => {
    await mount(React.createElement(FeedbackPressable));
    act(() => button().props.onPressIn(event));
    act(() => native.listener?.(true));
    expect(flatten(button().props.style).transform).toBeUndefined();
    act(() => tree.unmount());
    expect(native.remove).toHaveBeenCalledOnce();
    expect(native.stop).toHaveBeenCalled();
  });

  it("reveal never hides content with reduced motion", async () => {
    native.reduced = true;
    await mount(React.createElement(Reveal, null, "Door details"));
    const view = tree.root.findByType("animated-view" as never);
    expect(flatten(view.props.style).opacity.value).toBe(1);
    expect(native.timing).not.toHaveBeenCalled();
  });

  it("staggers tilted reveals by index and keeps them flat and immediate with reduced motion", async () => {
    native.reduced = false;
    await mount(React.createElement(
      "view", null,
      React.createElement(Reveal, { index: 0, tilt: true }, "First"),
      React.createElement(Reveal, { index: 3, tilt: true }, "Fourth"),
      React.createElement(Reveal, { index: 40 }, "Capped"),
    ));
    const delays = native.timing.mock.calls.map(([options]) => options.delay);
    expect(delays).toEqual([0, 108, 432]);
    const views = tree.root.findAllByType("animated-view" as never);
    expect(flatten(views[0].props.style).transform[0]).toEqual({ perspective: 640 });
    expect(flatten(views[2].props.style).transform).toHaveLength(1);
    act(() => tree.unmount());
    native.reduced = true;
    native.timing.mockClear();
    await mount(React.createElement(Reveal, { index: 5, tilt: true }, "Still"));
    expect(native.timing).not.toHaveBeenCalled();
    expect(flatten(tree.root.findByType("animated-view" as never).props.style).opacity.value).toBe(1);
  });

  it("animated numbers ease to their target and snap under reduced motion", async () => {
    native.reduced = false;
    await mount(React.createElement(AnimatedNumber, { value: 42, format: (current: number) => `${Math.round(current)} doors` }));
    expect(tree.root.findByType("text" as never).children.join("")).toBe("42 doors");
    expect(native.timing).toHaveBeenCalledWith(expect.objectContaining({ toValue: 42, useNativeDriver: false }));
    act(() => tree.unmount());
    native.reduced = true;
    native.timing.mockClear();
    await mount(React.createElement(AnimatedNumber, { value: 7 }));
    expect(tree.root.findByType("text" as never).children.join("")).toBe("7");
    expect(native.timing).not.toHaveBeenCalled();
  });

  it("success effects stay static with reduced motion and never hide their content", async () => {
    native.reduced = true;
    await mount(React.createElement(
      "view", null,
      React.createElement(Pop, null, "Saved"),
      React.createElement(Pulse, { trigger: true, color: "#0f0" }, "Installed"),
      React.createElement(AnimatedFill, { percent: 40 }),
    ));
    const views = tree.root.findAllByType("animated-view" as never);
    expect(views).toHaveLength(3);
    expect(flatten(views[0].props.style).transform[0].scale.value).toBe(1);
    expect(views[1].props.children.filter(Boolean)).toEqual(["Installed"]);
    expect(flatten(views[2].props.style).width.value).toBe(40);
    expect(native.spring).not.toHaveBeenCalled();
    expect(native.timing).not.toHaveBeenCalled();
  });

  it("success effects spring the mark, ring the beacon and glide the fill when motion is allowed", async () => {
    native.reduced = false;
    await mount(React.createElement(
      "view", null,
      React.createElement(Pop, null, "Saved"),
      React.createElement(Pulse, { trigger: true, color: "#0f0" }, "Installed"),
      React.createElement(AnimatedFill, { percent: 40 }),
    ));
    const views = tree.root.findAllByType("animated-view" as never);
    expect(views).toHaveLength(4);
    expect(native.spring).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ toValue: 1, useNativeDriver: true }));
    expect(native.timing).toHaveBeenCalledWith(expect.objectContaining({ toValue: 1, useNativeDriver: true }));
    expect(native.timing).toHaveBeenCalledWith(expect.objectContaining({ toValue: 40, useNativeDriver: false }));
    expect(flatten(views[3].props.style).width.value).toBe(40);
    act(() => tree.update(React.createElement(
      "view", null,
      React.createElement(Pop, null, "Saved"),
      React.createElement(Pulse, { trigger: false, color: "#0f0" }, "Installed"),
      React.createElement(AnimatedFill, { percent: 40 }),
    )));
    expect(tree.root.findAllByType("animated-view" as never)).toHaveLength(3);
  });
});

describe("shared workflow controls", () => {
  it("prepares a journal once even when the same callback is pressed twice before render", async () => {
    native.loadJournals.mockResolvedValue({ data: [], source: "online" });
    let finish!: (value: unknown) => void;
    native.prepareJournal.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(React.createElement(JournalScreen));
    const target = tree.root.findAllByType("pressable" as never).find((node) => node.props.accessibilityLabel === "Сформировать акт")!;
    const press = target.props.onPress;
    act(() => { press(event); press(event); });
    expect(native.prepareJournal).toHaveBeenCalledExactlyOnceWith("project-a", "ru");
    expect(target.props.disabled).toBe(true);
    await act(async () => finish({ id: "journal-a", project_id: "project-a", status: "DRAFT", completed_doors: 1, completed_addons: 0 }));
    expect(native.push).toHaveBeenCalledExactlyOnceWith("/journal/journal-a");
  });

  it("journal cards navigate to their document without nested buttons", async () => {
    native.loadJournals.mockResolvedValue({ data: [{ id: "journal-a", project_id: "project-a", status: "DRAFT", completed_doors: 1, completed_addons: 0 }], source: "online" });
    await mount(React.createElement(JournalScreen));
    const targets = tree.root.findAllByType("pressable" as never);
    for (const target of targets) {
      expect(target.findAllByType("pressable" as never)).toHaveLength(1);
    }
    const card = targets.find((node) => node.props.testID === "journal-document-journal-a")!;
    act(() => card.props.onPress(event));
    expect(native.push).toHaveBeenCalledExactlyOnceWith("/journal/journal-a");
  });

  it("read-only metrics are not fake buttons; actionable metrics include zero in their label", async () => {
    const onPress = vi.fn();
    await mount(React.createElement(React.Fragment, null,
      React.createElement(MetricTile, { label: "Doors", value: 4 }),
      React.createElement(MetricTile, { label: "Queued", value: 0, onPress }),
    ));
    expect(tree.root.findAllByType("pressable" as never)).toHaveLength(1);
    expect(button().props.accessibilityLabel).toBe("Queued. 0");
    act(() => button().props.onPress(event));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it.each([
    ["My work", "Sora_800ExtraBold", undefined],
    ["Мои работы", "Manrope_700Bold", undefined],
    ["העבודות שלי", "sans-serif", "700"],
  ])("keeps a legible heading font for %s", async (label, fontFamily, fontWeight) => {
    await mount(React.createElement(BrandText, { style: { fontFamily: "Sora_800ExtraBold" } }, label));
    expect(flatten(tree.root.findByType("text" as never).props.style)).toMatchObject({ fontFamily, fontWeight });
  });

  it("loading buttons expose busy state and block duplicate submission", async () => {
    const onPress = vi.fn();
    await mount(React.createElement(ActionButton, { label: "Install", loading: true, onPress }));
    act(() => button().props.onPress(event));
    expect(button().props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(onPress).not.toHaveBeenCalled();
  });

  it("icon buttons retain caller styles and disabled appearance", async () => {
    await mount(React.createElement(IconButton, { label: "Sync", icon: "sync", disabled: true, style: { marginTop: 7 } }));
    expect(flatten(button().props.style)).toMatchObject({ marginTop: 7, opacity: 0.42 });
  });

  it("each segment selects its own value once", async () => {
    const onChange = vi.fn();
    await mount(React.createElement(SegmentedControl, { value: "ALL", options: [{ value: "ALL", label: "All" }, { value: "OPEN", label: "Open" }], onChange }));
    act(() => tree.root.findAllByType("pressable" as never)[1].props.onPress(event));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("OPEN");
  });

  it("busy confirmation cannot be dismissed by backdrop or Android back", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    await mount(React.createElement(ConfirmDialog, {
      visible: true, busy: true, title: "Retry", message: "Saved work", confirmLabel: "Retry", cancelLabel: "Cancel", onCancel, onConfirm,
    }));
    act(() => {
      tree.root.findByType("modal" as never).props.onRequestClose();
      for (const target of tree.root.findAllByType("pressable" as never)) target.props.onPress(event);
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
