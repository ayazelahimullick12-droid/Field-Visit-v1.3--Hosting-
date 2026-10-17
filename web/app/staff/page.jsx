"use client";

import dynamic from "next/dynamic";
import ClientOnly from "../ClientOnly";

// The screens live in src/staff/ (plain React). Loaded in the browser only.
const App = dynamic(() => import("../../src/staff/App"), { ssr: false });

export default function Page() {
  return (
    <ClientOnly offline={true}>
      <title>Field Visit Tracker — Staff</title>
      <App />
    </ClientOnly>
  );
}
