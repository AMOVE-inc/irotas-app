import { forwardRef, useEffect, useMemo, useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { expandingInputHeightForValue, expandingInputMetrics } from "@/lib/expanding-input";

export type ExpandingMessageInputProps = TextInputProps & {
  minLines?: number;
  maxLines?: number;
  inputLineHeight?: number;
  verticalPadding?: number;
};

/** Starts at one line, grows with wrapped/newline content, then scrolls after six lines. */
export const ExpandingMessageInput = forwardRef<TextInput, ExpandingMessageInputProps>(function ExpandingMessageInput(
  {
    minLines = 1,
    maxLines = 6,
    inputLineHeight = 20,
    verticalPadding = 10,
    onContentSizeChange,
    style,
    value,
    ...props
  },
  ref,
) {
  const bounds = useMemo(
    () => expandingInputMetrics(0, minLines, maxLines, inputLineHeight, verticalPadding),
    [inputLineHeight, maxLines, minLines, verticalPadding],
  );
  const [height, setHeight] = useState(bounds.minHeight);
  const explicitLineHeight = expandingInputHeightForValue(
    typeof value === "string" ? value : undefined,
    minLines,
    maxLines,
    inputLineHeight,
    verticalPadding,
  );
  const visibleHeight = Math.min(bounds.maxHeight, Math.max(height, explicitLineHeight));

  useEffect(() => {
    if (!value) setHeight(bounds.minHeight);
  }, [bounds.minHeight, value]);

  return (
    <TextInput
      {...props}
      ref={ref}
      value={value}
      multiline
      blurOnSubmit={false}
      submitBehavior="newline"
      onContentSizeChange={(event) => {
        const next = expandingInputMetrics(
          event.nativeEvent.contentSize.height,
          minLines,
          maxLines,
          inputLineHeight,
          verticalPadding,
        );
        setHeight(next.height);
        onContentSizeChange?.(event);
      }}
      scrollEnabled={visibleHeight >= bounds.maxHeight}
      style={[
        style,
        {
          height: visibleHeight,
          minHeight: bounds.minHeight,
          maxHeight: bounds.maxHeight,
          lineHeight: inputLineHeight,
          textAlignVertical: "top",
        },
      ]}
    />
  );
});
