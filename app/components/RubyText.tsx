import { useMemo } from 'react';

// Define the shape of the props for type safety
interface RubyTextProps {
  children: string;
}

// Define the type for a parsed ruby tag part
type RubyPart = {
  type: 'ruby';
  base: string; // The main text
  text: string; // The smaller text above
};

/**
 * Parses a string with custom ruby tags "[ruby=text]base[/ruby]"
 * and renders it as an HTML <ruby> element using React and Tailwind CSS.
 *
 * @param {RubyTextProps} props
 * @returns {React.ReactElement}
 */
const RubyText: React.FC<RubyTextProps> = ({ children }) => {
  // useMemo ensures the parsing logic only runs when the input string changes.
  const parsedParts = useMemo((): (string | RubyPart)[] => {
    if (typeof children !== 'string') return [children];

    const parts: (string | RubyPart)[] = [];
    const rubyRegex = /\[ruby=(.*?)\](.*?)\[\/ruby\]/g;

    let lastIndex = 0;
    let match;

    while ((match = rubyRegex.exec(children)) !== null) {
      // 1. Add the plain text before the matched ruby tag
      if (match.index > lastIndex) {
        parts.push(children.substring(lastIndex, match.index));
      }

      // 2. Add the parsed ruby part as a structured object
      const [, rubyText, baseText] = match;
      parts.push({
        type: 'ruby',
        base: baseText,
        text: rubyText,
      });

      // 3. Update the index for the next iteration
      lastIndex = rubyRegex.lastIndex;
    }

    // 4. Add any remaining plain text after the last match
    if (lastIndex < children.length) {
      parts.push(children.substring(lastIndex));
    }

    return parts;
  }, [children]);

  return (
    // The main container span
    <span>
      {parsedParts.map((part, index) => {
        // If the part is a structured ruby object, render it with <ruby>
        if (typeof part == 'string') return part;

        if (typeof part === 'object' && part.type === 'ruby') {
          return (
            <ruby key={index}>
              {part.base}
              {/* The small text above, styled with Tailwind CSS */}
              <rt className="select-none text-[0.8em] text-neutral-500 opacity-90">{part.text}</rt>
            </ruby>
          );
        }
      })}
    </span>
  );
};

export default RubyText;
