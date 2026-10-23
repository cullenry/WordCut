export function TranscriptPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">Transcript</div>
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="font-medium">No transcript yet</p>
          <p className="mt-2 max-w-xs text-sm text-muted">
            Transcription comes in the next step. Words will appear here, and clicking one will jump the
            video to that moment.
          </p>
        </div>
      </div>
    </div>
  );
}
