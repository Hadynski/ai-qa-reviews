"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

const MAX_KEYTERMS = 100;
const MAX_KEYTERM_LENGTH = 50;

export default function SettingsPage() {
  const router = useRouter();
  const { isLoading: authLoading, isAdmin } = useCurrentUser();
  const savedKeyterms = useQuery(api.settings.getElevenLabsKeyterms);
  const setKeyterms = useMutation(api.settings.setElevenLabsKeyterms);

  const [terms, setTerms] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (savedKeyterms !== undefined && !initialized) {
      setTerms(savedKeyterms);
      setInitialized(true);
    }
  }, [savedKeyterms, initialized]);

  if (!authLoading && !isAdmin) {
    router.push("/");
    return null;
  }

  const hasChanges =
    initialized &&
    savedKeyterms !== undefined &&
    JSON.stringify(terms) !== JSON.stringify(savedKeyterms);

  function addTerm() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (trimmed.length > MAX_KEYTERM_LENGTH) {
      toast.error(`Term must be ${MAX_KEYTERM_LENGTH} characters or less`);
      return;
    }
    if (terms.includes(trimmed)) {
      toast.error("Term already exists");
      return;
    }
    if (terms.length >= MAX_KEYTERMS) {
      toast.error(`Maximum ${MAX_KEYTERMS} terms allowed`);
      return;
    }

    setTerms([...terms, trimmed]);
    setInputValue("");
  }

  function removeTerm(index: number) {
    setTerms(terms.filter((_, i) => i !== index));
  }

  function handleDiscard() {
    if (savedKeyterms) {
      setTerms(savedKeyterms);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setKeyterms({ keyterms: terms });
      toast.success("Keyterms saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save keyterms"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in-up">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>ElevenLabs Keyterms</CardTitle>
          <CardDescription>
            Keyterms bias ElevenLabs Scribe v2 transcription toward specific
            words or phrases (names, jargon, product terms). Max {MAX_KEYTERMS}{" "}
            terms, {MAX_KEYTERM_LENGTH} characters each. Using keyterms adds a
            small per-request cost.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add a keyterm..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTerm();
                }
              }}
              maxLength={MAX_KEYTERM_LENGTH}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addTerm}
              disabled={!inputValue.trim()}
            >
              Add
            </Button>
          </div>

          {terms.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {terms.map((term, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted px-2.5 py-1 text-sm"
                >
                  {term}
                  <button
                    type="button"
                    onClick={() => removeTerm(index)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No keyterms configured. Transcription will use default vocabulary.
            </p>
          )}
        </CardContent>

        {hasChanges && (
          <CardFooter className="flex gap-2 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={handleDiscard} disabled={saving}>
              Discard
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
