import React, { useRef } from 'react';

interface UploadZoneProps {
  onFilesSelect: (files: File[]) => void;
  isLoading: boolean;
  fileCount: number;
  accept?: string;
  title?: string;
  subtitle?: string;
  selectedFiles?: File[];
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFilesSelect,
  isLoading,
  fileCount,
  accept = ".pdf,.docx,.doc,.txt,image/*",
  title,
  subtitle,
  selectedFiles = []
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelect(Array.from(e.dataTransfer.files));
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelect(Array.from(e.target.files));
    }
  };

  const getFileIcon = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.docx') || name.endsWith('.doc')) return '📝';
    if (name.endsWith('.pdf')) return '📕';
    if (name.endsWith('.txt')) return '📄';
    return '📸';
  };

  return (
    <div 
      className={`
        border-4 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer relative overflow-hidden group
        ${isLoading ? 'border-gray-300 bg-gray-50 opacity-50 cursor-not-allowed' : 'border-blue-300 bg-blue-50/60 hover:bg-blue-100/70 hover:border-blue-500'}
      `}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={!isLoading ? handleClick : undefined}
    >
      <input 
        type="file" 
        multiple 
        accept={accept}
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
        disabled={isLoading}
      />
      
      <div className="flex flex-col items-center justify-center space-y-4 relative z-10">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl shadow-md flex items-center justify-center text-3xl sm:text-4xl text-blue-500 group-hover:scale-110 transition-transform">
          {fileCount > 0 ? (selectedFiles[0] ? getFileIcon(selectedFiles[0]) : '📚') : '📑'}
        </div>
        
        <div className="space-y-1 max-w-lg">
          <p className="text-lg sm:text-xl font-black text-blue-900">
            {fileCount > 0
              ? `${fileCount} tệp đã chọn sẵn sàng xử lý`
              : (title || 'Kéo thả hoặc nhấn để chọn tài liệu / đề thi')}
          </p>
          <p className="text-xs sm:text-sm text-blue-700 font-medium">
            {subtitle || 'Hỗ trợ file Word (.docx, .doc), PDF (.pdf), hình ảnh (.jpg, .png) hoặc tài liệu đề thi'}
          </p>
        </div>

        {/* Display selected files */}
        {selectedFiles && selectedFiles.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-2 max-h-36 overflow-y-auto p-2 bg-white/70 rounded-xl border border-blue-200">
            {selectedFiles.map((file, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg shadow-sm border border-blue-200 text-xs font-bold text-blue-900"
              >
                <span>{getFileIcon(file)}</span>
                <span className="truncate max-w-[200px]">{file.name}</span>
                <span className="text-slate-400 font-normal">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {fileCount > 0 && (
        <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs font-black px-3 py-1 rounded-full animate-bounce shadow-md">
          Sẵn sàng!
        </div>
      )}
    </div>
  );
};
