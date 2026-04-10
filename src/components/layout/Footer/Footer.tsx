import { GithubIcon } from "../../Icons/GithubIcon";
import { IconLinkButton } from "../../ui/IconLinkButton/IconLinkButton";

import "./Footer.css";

const GITHUB_REPO_URL = "https://github.com/salasc2/algoviz";
const GITHUB_PROFILE_URL = "https://github.com/salasc2";

export const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <IconLinkButton href={GITHUB_REPO_URL} label="View Code">
          <GithubIcon />
        </IconLinkButton>

        <div className="footer-divider" />

        <IconLinkButton href={GITHUB_PROFILE_URL} label="Developed by @salasc2">
          <img
            src="https://github.com/salasc2.png"
            alt="salasc2 GitHub avatar"
            className="footer-avatar"
          />
        </IconLinkButton>
      </div>
    </footer>
  );
};