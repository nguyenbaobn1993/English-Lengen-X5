import React, { useState } from 'react';
import { MultipleChoiceQ } from '../types';
import { smartCheckMC, getAllSmartCorrectIndices } from '../utils/smartGrading';

interface QuizCardProps {
  question: MultipleChoiceQ;
  onComplete?: (isCorrect: boolean) => void;
}

export const QuizCard: React.FC<QuizCardProps> = ({ question, onComplete }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = () => {
    if (selected === null) return;
    setIsSubmitted(true);
    if (onComplete) {
      onComplete(smartCheckMC(selected, question.correctAnswer, question.options, question.alternativeCorrectAnswers));
    }
  };

  const isCorrect = selected !== null && smartCheckMC(selected, question.correctAnswer, question.options, question.alternativeCorrectAnswers);
  const allCorrectIndices = getAllSmartCorrectIndices(question.correctAnswer, question.options, question.alternativeCorrectAnswers);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
      <h4 className="font-semibold text-lg text-slate-800 mb-4">{question.question}</h4>
      <div className="space-y-3">
        {question.options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => !isSubmitted && setSelected(idx)}
            disabled={isSubmitted}
            className={`w-full text-left p-3 rounded-lg border transition-all duration-200 flex justify-between items-center
              ${isSubmitted 
                ? allCorrectIndices.includes(idx)
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : idx === selected
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-slate-50 border-slate-100 text-slate-400'
                : idx === selected
                  ? 'bg-brand-50 border-brand-200 text-brand-700 ring-2 ring-brand-100'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
              }
            `}
          >
            <span>{option}</span>
            {isSubmitted && allCorrectIndices.includes(idx) && (
               <span className="text-green-600">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
               </span>
            )}
            {isSubmitted && idx === selected && !allCorrectIndices.includes(idx) && (
               <span className="text-red-500">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
               </span>
            )}
          </button>
        ))}
      </div>
      
      {!isSubmitted && selected !== null && (
        <div className="mt-4 flex justify-end">
          <button 
            onClick={handleSubmit}
            className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 font-medium transition-colors"
          >
            Check Answer
          </button>
        </div>
      )}

      {isSubmitted && question.explanation && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${isCorrect ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          <strong>Explanation:</strong> {question.explanation}
        </div>
      )}
    </div>
  );
};