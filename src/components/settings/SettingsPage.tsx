import React from 'react';
import { useSettings } from '@/lib/hooks/useSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import SectionToggles from './SectionToggles';
import ThemeSelector from './ThemeSelector';
import BehaviorSettings from './BehaviorSettings';
import DataSettings from './DataSettings';

export default function SettingsPage() {
  const { settings, update, loading } = useSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  const slugUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('icons/sammy/sammy-128.jpg')
      : null;

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {slugUrl && (
          <img
            src={slugUrl}
            alt="Sammy the Slug"
            className="w-12 h-12 rounded-full"
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Rate My Slugs
          </h1>
          <p className="text-sm text-muted-foreground">
            Customize your experience
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Appearance */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Appearance
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ThemeSelector settings={settings} onUpdate={update} />
          </CardContent>
        </Card>

        {/* Sections */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sections
            </p>
          </CardHeader>
          <CardContent>
            <SectionToggles settings={settings} onUpdate={update} />
          </CardContent>
        </Card>

        {/* Behavior */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Behavior
            </p>
          </CardHeader>
          <CardContent>
            <BehaviorSettings settings={settings} onUpdate={update} />
          </CardContent>
        </Card>

        {/* Data */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Data & Cache
            </p>
          </CardHeader>
          <CardContent>
            <DataSettings settings={settings} onUpdate={update} />
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-muted-foreground">
        {/* Read from the manifest rather than hardcoded — this said v2.0 for
            two releases after it stopped being true. */}
        <p>
          Rate My Slugs v{chrome.runtime.getManifest().version} — Made with care
          at UC Santa Cruz
        </p>
        <p className="mt-1">
          Made by{' '}
          <a
            href="https://www.linkedin.com/in/ivan-kuria-46ab68312/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ucsc-blue hover:underline"
          >
            Ivan Kuria
          </a>
        </p>
        <div className="mt-2 flex items-center justify-center gap-3">
          {/* A permanent way back to the release notes. They open once after an
              update and are easy to miss, yet they hold the only control for
              turning MyScheduler on. */}
          <a
            href={chrome.runtime.getURL(
              `whats-new.html?to=${chrome.runtime.getManifest().version}`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ucsc-blue hover:underline"
          >
            What's new
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="mailto:ikuria@ucsc.edu?subject=Rate My Slugs Feedback"
            className="text-ucsc-blue hover:underline"
          >
            Send feedback
          </a>
        </div>
      </div>
    </div>
  );
}
