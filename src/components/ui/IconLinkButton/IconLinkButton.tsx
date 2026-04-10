import "./IconLinkButton.css";

type IconLinkButtonProps = {
  href: string;
  label: string;
  children: React.ReactNode;
};

export const IconLinkButton = ({
  href,
  label,
  children,
}: IconLinkButtonProps) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="icon-link-btn"
      aria-label={label}
      title={label}
    >
      {children}
      <span className="icon-link-text">{label}</span>
    </a>
  );
};