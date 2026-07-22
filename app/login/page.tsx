import LoginForm from "./LoginForm";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login — HNS IT Center",
};

export default function LoginPage() {
  return <LoginForm />;
}
