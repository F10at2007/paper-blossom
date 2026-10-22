import { renderPaper, pngBlob } from './free-paper.js';

/** Shared by free and folded workspaces; caller supplies the final full-sheet paths. */
export function createPaperDownloader() {
  const urls=new Set();
  return {
    async download(paths,color,filename,groups = null) {
      const output=document.createElement('canvas');
      output.width=output.height=2048;
      renderPaper(output,paths,color,groups);
      const blob=await pngBlob(output);
      const url=URL.createObjectURL(blob);
      urls.add(url);
      window.setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},10000);
      const link=document.createElement('a');
      link.href=url; link.download=filename;
      document.body.append(link);
      try {link.click();} finally {link.remove();}
    },
    release() { for(const url of urls) URL.revokeObjectURL(url); urls.clear(); },
  };
}
