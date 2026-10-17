"use client";

import dynamic from "next/dynamic";
import ClientOnly from "./ClientOnly";

// The screens live in src/landing/ (plain React). Loaded in the browser only.
const App = dynamic(() => import("../src/landing/App"), { ssr: false });

export default function Page() {
  return (
    <ClientOnly offline={false}>
      <title>Field Visit Tracker — Sign in</title>
      <App />
    </ClientOnly>
  );
}
