import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  reduced: false,
  listener: null as null | ((value: boolean) => void),
  remove: vi.fn(),
  timing: vi.fn(),
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
    constructor(value: number) { this.value = value; }
    setValue(value: number) { this.value = value; }
    interpolate() { return this; }
  }
  return {
    Pressable, View: "view", Text: "text", Modal: "modal", ActivityIndicator: "spinner", Platform: { OS: "android" },
    ScrollView: "scroll", RefreshControl: "refresh", StatusBar: "statusbar",
    StyleSheet: { create: (value: unknown) => value, flatten, absoluteFillObject: {} },
    Easing: { out: (value: unknown) => value, cubic: "cubic" },
    Animated: {
      Value, View: "animated-view", createAnimatedComponent: (component: unknown) => component,
      timing: (value: Value, options: { toValue: number }) => {
        native.timing(options);
        return { start: () => value.setValue(options.toValue), stop: native.stop };
      },
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
vi.mock("expo-router", () => ({ useRouter: () => ({ push: native.push }) }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: "ru" }) }));
vi.mock("@/modules/journal/service", () => ({ loadInstallerJournals: native.loadJournals, prepareInstallerJournal: native.prepareJournal }));
vi.mock("@/modules/projects/repository", () => ({
  listProjects: async () => [{ id: "project-a", name: "Project A", address: "Address A" }],
  listProjectDoors: async () => [{ status: "INSTALLED" }],
}));

import { FeedbackPressable } from "./feedback-pressable";
import { MotionProvider, Reveal } from "./motion";
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
});

describe("shared workflow controls", () => {
  it("prepares a journal once even when the same callback is pressed twice before render", async () => {
    native.loadJournals.mockResolvedValue({ data: [], source: "remote" });
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
    native.loadJournals.mockResolvedValue({ data: [{ id: "journal-a", project_id: "project-a", status: "DRAFT", completed_doors: 1, completed_addons: 0 }], source: "remote" });
    await mount(React.createElement(JournalScreen));
    const targets = tree.root.findAllByType("pressable" as never);
    for (const target of targets) {
      expect(target.findAllByType("pressable" as never)).toHaveLength(1);
    }
    const card = targets.find((node) => node.props.accessibilityLabel === "Project A. Черновик")!;
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
