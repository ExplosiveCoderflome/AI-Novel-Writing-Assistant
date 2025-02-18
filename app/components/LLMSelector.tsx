'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecommendationStore } from '../store/recommendation';

const LLMSelector = () => {
  const { selectedLLM, setSelectedLLM } = useRecommendationStore();

  const llmOptions = [
    { value: 'deepseek', label: 'Deepseek' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'cohere', label: 'Cohere' },
  ];

  return (
    <Select value={selectedLLM} onValueChange={setSelectedLLM}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="选择 LLM API" />
      </SelectTrigger>
      <SelectContent>
        {llmOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LLMSelector; 