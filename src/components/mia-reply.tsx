import ReactMarkdown from "react-markdown";

/** Readable assistant replies without raw Markdown or decorative dash bullets. */
export function MiaReply({ children }: { children: string }) {
  const text = children.replace(/\s*[—]\s*/g, ", ").replace(/\s+[–]\s+/g, ", ");
  return (
    <div className="space-y-3 break-words text-sm leading-7">
      <ReactMarkdown
        skipHtml
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-none space-y-2 pl-0">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-0">{children}</li>,
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          hr: () => null,
          img: () => null,
          a: ({ children }) => <span>{children}</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
