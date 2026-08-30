export const TASK_TEMPLATE = JSON.stringify(
  {
    taskname: "INSERT_TASK_NAME_HERE",
    description:
      "Provide clear, step-by-step instructions explaining how to perform this task. Write the description as if you are teaching someone for the first time. Include the objective, and any necessary context, this will go straight into the prompt of the language model",
  },
  null,
  2,
);

export const LABELS_TEMPLATE = JSON.stringify(
  {
    labels: [
      {
        name: "positive",
        description: "INSERT DEFINITION",
        keywords: ["INSERT YOUR KEYWORDS"],
        guidelines: ["Any initial guidelines you have created for annotating this label"],
      },
      {
        name: "negative",
        description: "INSERT DEFINITION",
        keywords: ["INSERT YOUR KEYWORDS"],
        guidelines: ["Any initial guidelines you have created for annotating this label"],
      },
      {
        name: "neutral",
        description: "INSERT DEFINITION",
        keywords: ["INSERT YOUR KEYWORDS"],
        guidelines: ["Any initial guidelines you have created for annotating this label"],
      },
    ],
  },
  null,
  2,
);

export const modelOptions = [
  {value: "gemma3:1b", label: "Gemma3-1B"},
  {value: "qwen3.5:2b", label: "Qwen3.5-2B"},
  {value: "mistral:7b", label: "Mistral-7B"},
  {value: "qwen:72b", label: "Qwen-72B"},
  {value: "llama3.3:70b", label: "Llama3.3-70B"},
];
