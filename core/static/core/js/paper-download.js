import { renderPaper, pngBlob } from './free-paper.js';

/** Shared by free and folded workspaces; caller supplies the final full-sheet paths. */
export function createPaperDownloader() {
  const urls=new Set();
  const file=(blob,filename)=>{
    const url=URL.createObjectURL(blob);urls.add(url);
    window.setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},10000);
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);
    try{link.click();}finally{link.remove();}
  };
  return {
    file,
    async download(paths,color,filename,groups = null,renderer = null) {
      const output=document.createElement('canvas');
      output.width=output.height=2048;
      if(renderer)renderer(output);else renderPaper(output,paths,color,groups);
      const blob=await pngBlob(output);
      file(blob,filename);
    },
    release() { for(const url of urls) URL.revokeObjectURL(url); urls.clear(); },
  };
}
