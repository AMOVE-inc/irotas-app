import { forwardRef, useEffect, useMemo, useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { expandingInputMetrics } from "@/lib/expanding-input";

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

  useEffect(() => {
    if (!value) setHeight(bounds.minHeight);
  }, [bounds.minHeight, value]);

  return (
    <TextInput
      {...props}
      ref={ref}
      value={value}
      multiline
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
      scrollEnabled={height >= bounds.maxHeight}
      style={[
        style,
        {
          height,
          minHeight: bounds.minHeight,
          maxHeight: bounds.maxHeight,
          lineHeight: inputLineHeight,
          textAlignVertical: "top",
        },
      ]}
    />
  );
});
