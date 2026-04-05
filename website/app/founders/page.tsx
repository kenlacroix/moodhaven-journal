import { permanentRedirect } from "next/navigation";

export default function FoundersPage() {
  permanentRedirect("/about");
}
