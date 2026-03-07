import { Redirect } from "expo-router";
import React from "react";
import { useAuth } from "@/providers/AppProviders";

export default function IndexScreen() {
  const { user } = useAuth();
  if (!user) {
    return <Redirect href="/login" />;
  }
  return <Redirect href="/projects" />;
}
