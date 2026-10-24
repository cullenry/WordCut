import { Editor } from "@/components/editor/Editor";
import { themeScript } from "@/components/ui/theme";

export default function EditorPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript("dark") }} />
      <Editor />
    </>
  );
}
