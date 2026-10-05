import { useState } from "react";
import { Anchor, Box, Button, Group, Paper, Stack, Text, Textarea, Title, Badge, Collapse, Center } from "@mantine/core";
import {
  IconArrowRight,
  IconUpload,
  IconRobot,
  IconFileText,
  IconChecklist,
  IconBook2,
  IconChevronDown,
  IconSend,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useDemo } from "../demo/DemoContext";
import { PilotBanner } from "../components/PilotBanner";
import styles from "./LandingPage.module.css";

const isPilot = import.meta.env.VITE_APP_MODE === "pilot";
const CONTACT_EMAIL = "jranjit@usc.edu";

type TabType = "description" | "example" | "demo";
type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export default function LandingPage() {
  const navigate = useNavigate();
  const { isDemo } = useDemo();
  const [activeTab, setActiveTab] = useState<TabType>("description");
  const [activeStep, setActiveStep] = useState<StepNumber>(1);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [inquiry, setInquiry] = useState("");
  const [feedback, setFeedback] = useState("");

  const sendMail = (subject: string, body: string) => {
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  const steps: Array<{ number: StepNumber; title: string }> = [
    { number: 1, title: "The task" },
    { number: 2, title: "LLM reads a post" },
    { number: 3, title: "You validate" },
    { number: 4, title: "Batch done → rules" },
    { number: 5, title: "Next batch, smarter" },
    { number: 6, title: "Done — export" },
  ];

  const renderExamplePanel = () => {
    switch (activeStep) {
      case 1:
        return (
          <Stack gap="md">
            <Box>
              <Text className={styles.panelLabel}>Labels</Text>
              <Stack gap={8} mt={8}>
                <Box className={styles.labelCard}>
                  <Text className={styles.labelName}>positive</Text>
                  <Text className={styles.labelDef}>
                    Supports protecting pangolins — rescue, anti-trafficking, conservation awareness or fundraising
                  </Text>
                </Box>
                <Box className={styles.labelCard}>
                  <Text className={styles.labelName}>negative</Text>
                  <Text className={styles.labelDef}>
                    Promotes selling, eating, or using pangolins — bushmeat, scales, trade, or blaming them for disease
                  </Text>
                </Box>
                <Box className={styles.labelCard}>
                  <Text className={styles.labelName}>neutral</Text>
                  <Text className={styles.labelDef}>
                    Mentions pangolins with no clear stance — memes, games, logos, or descriptive references
                  </Text>
                </Box>
              </Stack>
            </Box>

            <Box className={styles.divider} />

            <Box>
              <Text className={styles.panelLabel}>Upload files</Text>
              <Stack gap={8} mt={8}>
                {[
                  {
                    name: "Labeled",
                    file: "labeled.csv",
                    desc: "Pre-labeled dataset for validation. Should contain your raw text data and ground-truth labels. Used to evaluate LLM performance and calibrate feedback.",
                    sample: "id,translated_text,label\n1,\"Donated to a pangolin rescue today!\",positive\n2,\"Fresh pangolin scales for sale, DM me...\",negative\n3,\"Cute cartoon pangolin in the new game\",neutral"
                  },
                  {
                    name: "Unlabeled",
                    file: "unlabeled.csv",
                    desc: "Large pool of unlabeled data. The system will select 150 representative samples from this for annotation. Should be diverse and representative of your full dataset.",
                    sample: "id,translated_text\n1,\"Please share to help stop pangolin poaching...\"\n2,\"Pangolin meat is a must-try delicacy...\"\n3,\"My pangolin plushie arrived today 🥰\"\n4,\"Pangolins are the most trafficked mammal...\""
                  },
                  {
                    name: "Task_Details",
                    file: "task.json",
                    desc: "JSON file describing the annotation task. Includes task name, description, and special instructions.",
                    sample: `{
  "name": "Pangolin_Conservation_Sentiment",
  "description": "Classify the sentiment of pangolin social media posts toward conservation",
  "text_column": "translated_text",
  "label_column": "label"
}`
                  },
                  {
                    name: "Labels",
                    file: "labels.json",
                    desc: "JSON file defining all available labels with descriptions and keywords for LLM understanding.",
                    sample: `[
  {
    "name": "positive",
    "description": "Supports protecting pangolins",
    "keywords": ["save", "protect", "conservation", "awareness"]
  },
  {
    "name": "negative",
    "description": "Promotes selling, eating, or harming pangolins",
    "keywords": ["for sale", "meat", "scales", "poaching"]
  }
]`
                  },
                ].map((file) => (
                  <Box key={file.name}>
                    <button
                      className={styles.fileExpandButton}
                      onClick={() => setExpandedFile(expandedFile === file.name ? null : file.name)}
                    >
                      <Group justify="space-between" style={{ width: "100%" }}>
                        <Group gap={8}>
                          <IconFileText size={12} />
                          <span>{file.file}</span>
                          <Text className={styles.fileLabel}>{file.name}</Text>
                        </Group>
                        <IconChevronDown size={14} style={{ transform: expandedFile === file.name ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }} />
                      </Group>
                    </button>
                    <Collapse in={expandedFile === file.name}>
                      <Stack gap={8}>
                        <Text className={styles.fileDescription}>{file.desc}</Text>
                        <Box className={styles.sampleDataBox}>
                          <Text className={styles.sampleDataLabel}>Sample:</Text>
                          <pre className={styles.sampleDataPre}>{file.sample}</pre>
                        </Box>
                      </Stack>
                    </Collapse>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Box>
              <Text className={styles.panelLabel}>Sampling strategy</Text>
              <Text className={styles.sampleBadgeText}>
                ✓ 150 samples selected via semantic + representative sampling
              </Text>
            </Box>
          </Stack>
        );

      case 2:
        return (
          <Stack gap="md">
            <Box className={styles.sampleBox}>
              <Text className={styles.panelLabel}>Sample post</Text>
              <Text className={styles.sampleText}>
                "Please share to help stop pangolin poaching — they're the most trafficked mammal on Earth and desperately need our protection. 💚"
              </Text>
            </Box>

            <Box className={styles.divider} />

            <Box>
              <Text className={styles.panelLabel}>LLM prediction</Text>
              <Stack gap={8} mt={8}>
                <Box className={styles.predictionRow}>
                  <span className={styles.predictionLabel}>Label</span>
                  <span className={styles.predictionValue}>positive</span>
                </Box>
                <Box className={styles.predictionRow}>
                  <span className={styles.predictionLabel}>Span text</span>
                  <span className={styles.predictionValue}>stop pangolin poaching... need our protection</span>
                </Box>
                <Box className={styles.predictionRow}>
                  <span className={styles.predictionLabel}>Reasoning</span>
                  <span className={styles.predictionValue}>
                    The post advocates protecting pangolins and raising anti-trafficking awareness — a clearly pro-conservation stance.
                  </span>
                </Box>
              </Stack>
            </Box>
          </Stack>
        );

      case 3:
        return (
          <Stack gap="md">
            <Box>
              <Text className={styles.panelLabel}>Progress</Text>
              <Text className={styles.progressText}>Batch 1 · Sample 3 of 5</Text>
            </Box>

            <Box className={styles.sampleBox}>
              <Text className={styles.panelLabel}>Sample post</Text>
              <Text className={styles.sampleText}>
                "My little cousin won't stop showing off her new cartoon pangolin plushie 🥰 it's genuinely the cutest thing."
              </Text>
            </Box>

            <Box className={styles.divider} />

            <Box>
              <Text className={styles.panelLabel}>Validate AI prediction</Text>
              <Stack gap={8} mt={8}>
                <Box className={styles.validationRowIncorrect}>
                  <Box>
                    <Text className={styles.validationLabel}>Label</Text>
                    <Text className={styles.validationText}>positive</Text>
                  </Box>
                  <span className={styles.xmark}>✗</span>
                </Box>
                <Box>
                  <Text className={styles.feedbackLabel}>You marked as incorrect</Text>
                  <textarea className={styles.feedbackInput} placeholder="Explain why this prediction was wrong..." defaultValue="This is just a cute personal post about a toy — it takes no stance on conservation. Should be 'neutral'." />
                </Box>
                <Box className={styles.validationRowCorrect}>
                  <Box>
                    <Text className={styles.validationLabel}>Correct label</Text>
                    <Text className={styles.validationText}>neutral</Text>
                  </Box>
                  <span className={styles.checkmark}>✓</span>
                </Box>
              </Stack>
            </Box>
          </Stack>
        );

      case 4:
        return (
          <Stack gap="md">
            <Box className={styles.batchCompleteBox}>
              <Text className={styles.batchCompleteText}>Batch 1 complete · 5 samples reviewed</Text>
            </Box>

            <Box className={styles.divider} />

            <Box>
              <Text className={styles.panelLabel}>Rules synthesized</Text>
              <Stack gap={8} mt={8}>
                <Box className={styles.ruleCard}>
                  <Group justify="space-between" align="flex-start" gap="sm">
                    <Text className={styles.ruleText}>
                      Posts promoting rescue, anti-trafficking, or conservation awareness → positive
                    </Text>
                    <Badge size="sm" variant="light" color="green">
                      new
                    </Badge>
                  </Group>
                </Box>
                <Box className={styles.ruleCard}>
                  <Group justify="space-between" align="flex-start" gap="sm">
                    <Text className={styles.ruleText}>
                      Posts with no stance — memes, plushies, games, or logos → neutral
                    </Text>
                    <Badge size="sm" variant="light" color="green">
                      new
                    </Badge>
                  </Group>
                </Box>
              </Stack>
              <Text className={styles.ruleCountText}>2 new rules added</Text>
            </Box>

            <Box>
              <Text className={styles.accuracyBadgeLabel}>Batch accuracy</Text>
              <Text className={styles.accuracyValue}>80%</Text>
            </Box>
          </Stack>
        );

      case 5:
        return (
          <Stack gap="md">
            <Box>
              <Text className={styles.panelLabel}>Progress</Text>
              <Text className={styles.progressText}>Batch 2 · Sample 7 of 10</Text>
            </Box>

            <Box className={styles.sampleBox}>
              <Text className={styles.panelLabel}>Sample post</Text>
              <Text className={styles.sampleText}>
                "Get your fresh pangolin scales here — traditional medicine, best prices in town. DM to order, we ship anywhere. 🐾"
              </Text>
            </Box>

            <Box className={styles.divider} />

            <Box>
              <Text className={styles.panelLabel}>LLM prediction (using rules)</Text>
              <Stack gap={8} mt={8}>
                <Box className={styles.predictionRow}>
                  <span className={styles.predictionLabel}>Label</span>
                  <span className={styles.predictionValue}>negative</span>
                </Box>
                <Box className={styles.predictionRow}>
                  <span className={styles.predictionLabel}>Span text</span>
                  <span className={styles.predictionValue}>fresh pangolin scales... traditional medicine, best prices</span>
                </Box>
              </Stack>
            </Box>

            <Box>
              <Text className={styles.accuracyBadgeLabel}>Batch accuracy</Text>
              <Text className={styles.accuracyValue}>94%</Text>
            </Box>

            <Box>
              <Text className={styles.panelLabel}>Codebook now has</Text>
              <Text className={styles.codebookStats}>6 rules</Text>
            </Box>
          </Stack>
        );

      case 6:
        return (
          <Stack gap="md">
            <Box className={styles.completeBox}>
              <Text className={styles.completeText}>✓ All 150 samples reviewed</Text>
            </Box>

            <Box className={styles.divider} />

            <Box>
              <Text className={styles.panelLabel}>Final metrics</Text>
              <Group grow gap={8} mt={8}>
                <Box className={styles.metricCard}>
                  <Text className={styles.metricLabel}>Precision</Text>
                  <Text className={styles.metricValue}>0.91</Text>
                </Box>
                <Box className={styles.metricCard}>
                  <Text className={styles.metricLabel}>Recall</Text>
                  <Text className={styles.metricValue}>0.89</Text>
                </Box>
                <Box className={styles.metricCard}>
                  <Text className={styles.metricLabel}>F1</Text>
                  <Text className={styles.metricValue}>0.90</Text>
                </Box>
              </Group>
            </Box>

            <Box>
              <Text className={styles.panelLabel}>Codebook</Text>
              <Group gap={6} mt={8}>
                <span className={styles.summaryChip}>12 rules</span>
                <span className={styles.summaryChip}>3 labels</span>
                <span className={styles.summaryChip}>pangolin posts</span>
              </Group>
            </Box>

            <Button
              fullWidth
              size="md"
              radius="xl"
              className={styles.exportButton}
              leftSection={<IconChecklist size={16} />}
            >
              Export pangolin_sentiment_codebook.json
            </Button>

            <Box className={styles.divider} />

            <Box>
              <Text className={styles.panelLabel}>Your exported codebook</Text>
              <Box className={styles.sampleDataBox}>
                <pre className={styles.sampleDataPre}>{`{
  "name": "Pangolin_Conservation_Sentiment_v1",
  "description": "Classify the sentiment of pangolin social media posts toward conservation",
  "labels": ["positive", "negative", "neutral"],
  "rules": [
    "Posts promoting rescue, anti-trafficking, or conservation awareness → positive",
    "Posts describing pangolins as endangered or needing protection → positive",
    "Posts selling pangolin scales, meat, or products → negative",
    "Posts blaming pangolins for disease or wishing them harm → negative",
    "Posts with a pangolin meme, plushie, game, or logo and no stance → neutral",
    "Posts that mention pangolins descriptively without an opinion → neutral"
  ],
  "metadata": {
    "samples_reviewed": 150,
    "final_accuracy": 0.91,
    "created_at": "2025-05-13",
    "version": "1.0"
  }
}`}</pre>
              </Box>
              <Text className={styles.codebookHint}>
                Use this codebook in future annotation tasks to guide your LLM with learned rules and patterns.
              </Text>
            </Box>
          </Stack>
        );

      default:
        return null;
    }
  };

  return (
    <>
    {isPilot && !isDemo && <PilotBanner />}
    <Box className={styles.page}>
      <div className={styles.orbOne} />

      {/* Sticky Navbar */}
      <Box className={styles.navbar}>
        <div className={styles.navbarContent}>
          <Group gap="lg" justify="space-between" align="center">
            {/* Logo */}
            <Group gap={8}>
              <img src="/annotate-icon.svg" alt="Annotation Assistant" className={styles.navbarLogo} />
              <Text className={styles.logoText}>Annotation Assistant</Text>
            </Group>

            {/* Tabs */}
            <Group gap={12}>
              {["description", "example", "demo"].map((tab) => (
                <button
                  key={tab}
                  className={`${styles.tabButton} ${activeTab === tab ? styles.tabButtonActive : ""}`}
                  onClick={() => {
                    if (tab === "demo") {
                      isDemo ? navigate("/home") : (window.location.href = "/demo");
                    } else {
                      setActiveTab(tab as TabType);
                    }
                  }}
                >
                  <span style={{ textTransform: "capitalize" }}>
                    {tab}
                    {tab === "demo" && <IconArrowRight size={14} style={{ marginLeft: 4 }} />}
                  </span>
                </button>
              ))}
            </Group>

            {/* Login Button */}
            {!isDemo && (
              <Button
                size="md"
                radius="xl"
                className={styles.loginButton}
                rightSection={<IconArrowRight size={16} />}
                onClick={() => navigate("/login")}
              >
                Log in
              </Button>
            )}
          </Group>
        </div>
      </Box>

      {/* Content Area */}
      <Box className={styles.content}>
        {activeTab === "description" && (
          <Box className={styles.section}>
            <Center mb={32}>
              <img src="/annotate-icon.svg" alt="Annotation Assistant" className={styles.logoIcon} />
            </Center>
            <Box className={styles.hero}>
              <Title className={styles.heroTitle}>Human in the loop codebook development</Title>
              <Text className={styles.heroSubtitle}>
                To get started, create a task, define your labels, and work with
                language models to develop a codebook.
              </Text>
            </Box>

            <Box className={styles.conceptCardsContainer}>
              <Paper className={styles.conceptCard}>
                <Group gap={10} mb="sm">
                  <IconUpload size={20} className={styles.conceptIcon} />
                  <Text className={styles.conceptTitle}>Upload your data</Text>
                </Group>
                <Text className={styles.conceptText}>
                  Labeled validation set + unlabeled pool, task config, label definitions. Start with any dataset.
                </Text>
              </Paper>

              <Paper className={styles.conceptCard}>
                <Group gap={10} mb="sm">
                  <IconRobot size={20} className={styles.conceptIcon} />
                  <Text className={styles.conceptTitle}>Co-annotate with LLM</Text>
                </Group>
                <Text className={styles.conceptText}>
                  Review AI predictions, give feedback, rules synthesize automatically after every 5 samples.
                </Text>
              </Paper>

              <Paper className={styles.conceptCard}>
                <Group gap={10} mb="sm">
                  <IconBook2 size={20} className={styles.conceptIcon} />
                  <Text className={styles.conceptTitle}>Export a production codebook</Text>
                </Group>
                <Text className={styles.conceptText}>
                  A validated, rule-backed codebook ready to power large-scale annotation pipelines.
                </Text>
              </Paper>
            </Box>

            <Box className={styles.descriptionFooter}>
              <Button
                size="md"
                radius="xl"
                className={styles.exampleCta}
                rightSection={<IconArrowRight size={18} />}
                onClick={() => setActiveTab("example")}
              >
                See a step-by-step example
              </Button>
            </Box>

            <Box className={styles.contactCardsContainer}>
              <Paper className={styles.conceptCard}>
                <Text className={styles.conceptTitle}>Work with us</Text>
                <Text className={styles.conceptText} mb="sm">
                  Are you a community organization interested in working with us?
                  Send us a message.
                </Text>
                <Textarea
                  autosize
                  minRows={3}
                  placeholder="Tell us about your organization and how we might collaborate…"
                  value={inquiry}
                  onChange={(e) => setInquiry(e.currentTarget.value)}
                />
                <Button
                  mt="sm"
                  radius="xl"
                  leftSection={<IconSend size={16} />}
                  disabled={!inquiry.trim()}
                  onClick={() =>
                    sendMail("Collaboration inquiry — Annotation Assistant", inquiry)
                  }
                >
                  Send message
                </Button>
              </Paper>

              <Paper className={styles.conceptCard}>
                <Text className={styles.conceptTitle}>Share your feedback</Text>
                <Text className={styles.conceptText} mb="sm">
                  Did you try out our tool? We'd love to hear from you — tell us how
                  we can improve and what you'd like to see next.
                </Text>
                <Textarea
                  autosize
                  minRows={3}
                  placeholder="What worked well, what didn't, and what you'd like to see next…"
                  value={feedback}
                  onChange={(e) => setFeedback(e.currentTarget.value)}
                />
                <Button
                  mt="sm"
                  radius="xl"
                  leftSection={<IconSend size={16} />}
                  disabled={!feedback.trim()}
                  onClick={() => sendMail("Feedback — Annotation Assistant", feedback)}
                >
                  Send feedback
                </Button>
              </Paper>
            </Box>
            <Center mt="md">
              <Text size="sm" c="dimmed">
                Or email us directly at{" "}
                <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>.
              </Text>
            </Center>
          </Box>
        )}

        {activeTab === "example" && (
          <Box className={styles.exampleSection}>
            {/* Step List (Sidebar) */}
            <Box className={styles.stepListContainer}>
              <Stack gap={0}>
                {steps.map((step) => (
                  <button
                    key={step.number}
                    className={`${styles.stepButton} ${activeStep === step.number ? styles.stepButtonActive : ""}`}
                    onClick={() => setActiveStep(step.number)}
                  >
                    <span className={styles.stepNumber}>{step.number}</span>
                    <span className={styles.stepTitle}>{step.title}</span>
                  </button>
                ))}
              </Stack>
            </Box>

            {/* Panel */}
            <Box className={styles.examplePanel}>
              {renderExamplePanel()}
            </Box>
          </Box>
        )}

        {activeTab === "demo" && (
          <Box className={styles.section}>
            <Box style={{ textAlign: "center", paddingTop: 40 }}>
              <Text className={styles.comingSoonText}>Demo coming soon</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
    </>
  );
}
