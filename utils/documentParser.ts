import mammoth from 'mammoth';

export interface ParsedDocument {
  type: 'text' | 'pdf' | 'image';
  text?: string;
  base64?: string;
  mimeType?: string;
  fileName: string;
}

export const fileToBase64String = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const parseUploadedFile = async (file: File): Promise<ParsedDocument> => {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();

  // 1. Word Document (.docx)
  if (lowerName.endsWith('.docx')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const rawText = result.value || '';
      return {
        type: 'text',
        text: rawText,
        fileName
      };
    } catch (err: any) {
      console.warn('Không thể đọc file docx bằng mammoth, thử đọc văn bản thô:', err);
      const text = await file.text();
      return {
        type: 'text',
        text,
        fileName
      };
    }
  }

  // 2. Legacy Word Document (.doc) or text file (.txt)
  if (lowerName.endsWith('.txt')) {
    const text = await file.text();
    return {
      type: 'text',
      text,
      fileName
    };
  }

  if (lowerName.endsWith('.doc')) {
    try {
      const text = await file.text();
      return {
        type: 'text',
        text,
        fileName
      };
    } catch {
      throw new Error(`Định dạng .doc cũ không được hỗ trợ trực tiếp. Cô vui lòng mở file bằng Word và bấm 'Save As' sang .docx hoặc .pdf để hệ thống trích xuất chuẩn 100% nhé!`);
    }
  }

  // 3. PDF Document (.pdf)
  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    const base64 = await fileToBase64String(file);
    return {
      type: 'pdf',
      base64,
      mimeType: 'application/pdf',
      fileName
    };
  }

  // 4. Image (.jpg, .jpeg, .png, image/*)
  const base64 = await fileToBase64String(file);
  return {
    type: 'image',
    base64,
    mimeType: file.type || 'image/jpeg',
    fileName
  };
};
