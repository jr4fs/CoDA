import { useEffect, useState } from "react";
import { getAvailableModels, type ModelOption } from "../services/inference.service";

export function useModelOptions(skip = false) {
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (skip) return;
    let active = true;
    getAvailableModels()
      .then((models) => { if (active) setOptions(models); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [skip]);

  return { options, error };
}
