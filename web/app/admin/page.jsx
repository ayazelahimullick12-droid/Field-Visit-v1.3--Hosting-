"use client";

import dynamic from "next/dynamic";
import ClientOnly from "../ClientOnly";

// The screens live in src/admin/ (plain React). Loaded in the browser only.
const App = dynamic(() => import("../../src/admin/App"), { ssr: false });

export default function Page() {
  return (
    <ClientOnly offline={false}>
      <title>Field Visit Tracker — Admin console</title>
      <App />
    </ClientOnly>
  );
}
