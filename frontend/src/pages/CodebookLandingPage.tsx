import {
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconBraces,
  IconBook2,
  IconChecklist,
  IconFileText,
  IconRobot,
  IconSend,
  IconUpload,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./CodebookLandingPage.module.css";

const CONTACT_EMAIL = "jranjit@usc.edu";

export default function CodebookLandingPage() {
  const navigate = useNavigate();
  const [inquiry, setInquiry] = useState("");
  const [feedback, setFeedback] = useState("");

  const sendMail = (subject: string, body: string) => {
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Box className={styles.page}>
      <div className={styles.orbOne} />

      <Container fluid className={styles.hero}>
        <Badge className={styles.kicker} variant="light" color="gray">
          Guided Annotation Flow
        </Badge>
        <div className={styles.heroGrid}>
          <Paper className={styles.heroCard}>
            <Title className={styles.title}>Human in the loop codebook development</Title>
            <Text className={styles.subtitle} mt="sm">
              To get started, create a task, define your labels, and work with
              language models to develop a codebook.
            </Text>
            <Group mt="lg" gap="sm">
              <Button
                size="md"
                radius="xl"
                className={styles.primaryCta}
                rightSection={<IconArrowRight size={18} />}
                onClick={() => navigate("/new-codebook")}
              >
                Start a new task
              </Button>
            </Group>
          </Paper>
        </div>
      </Container>

      <Container fluid id="flow" className={styles.flowSection}>
        <Paper className={styles.walkthroughSection} mt="md">
          <Group justify="space-between" align="center" wrap="wrap" mb="xs">
            <Title order={4} className={styles.sectionTitle}>
              Example workflow
            </Title>
            <Text className={styles.sectionHint}>
              A realistic path from files to final codebook.
            </Text>
          </Group>
          <div className={styles.walkthroughRow}>
            <Paper className={styles.walkthroughCard}>
              <Stack gap={8}>
                <Group gap={8}>
                  <IconUpload size={18} className={styles.walkthroughIcon} />
                  <Text className={styles.walkthroughTitle}>1. Upload task bundle</Text>
                </Group>
                <Text className={styles.walkthroughText}>
                  Upload `labeled_examples.csv`, `remaining_notes.csv`, `task.json`, and `labels.json`.
                </Text>
                <div className={styles.mockPanel}>
                  <div className={styles.mockRow}>
                    <span className={styles.fileChip}><IconFileText size={12} /> labeled_examples.csv</span>
                  </div>
                  <div className={styles.mockRow}>
                    <span className={styles.fileChip}><IconFileText size={12} /> remaining_notes.csv</span>
                  </div>
                  <div className={styles.mockRow}>
                    <span className={styles.fileChip}><IconBraces size={12} /> task.json</span>
                    <span className={styles.fileChip}><IconBraces size={12} /> labels.json</span>
                  </div>
                </div>
              </Stack>
            </Paper>

            <div className={styles.walkthroughArrow}>
              <IconArrowRight size={22} />
            </div>

            <Paper className={styles.walkthroughCard}>
              <Stack gap={8}>
                <Group gap={8}>
                  <IconRobot size={18} className={styles.walkthroughIcon} />
                  <Text className={styles.walkthroughTitle}>2. Review and refine</Text>
                </Group>
                <Text className={styles.walkthroughText}>
                  Check AI predictions, mark correctness, and update rules in the codebook panel.
                </Text>
                <div className={styles.mockPanel}>
                  <div className={styles.sampleCard}>
                    <Text className={styles.sampleCardLabel}>Sample post</Text>
                    <Text className={styles.mockPrompt}>
                      "Ad on Facebook Marketplace showing one belt made with pangolin leather. On sale."
                    </Text>
                  </div>
                  <Group justify="space-between" gap={6} wrap="nowrap">
                    <span className={styles.predictionPill}>Predicted: negative</span>
                    <span className={styles.statusPill}>Marked: Correct</span>
                  </Group>
                  <div className={styles.ruleCard}>
                    <Text className={styles.sampleCardLabel}>Rule added</Text>
                    <Text className={styles.exampleLabel}>
                      If a post promotes pangolin products or sales, label it as negative toward conservation.
                    </Text>
                  </div>
                </div>
              </Stack>
            </Paper>

            <div className={styles.walkthroughArrow}>
              <IconArrowRight size={22} />
            </div>

            <Paper className={styles.walkthroughCard}>
              <Stack gap={8}>
                <Group gap={8}>
                  <IconBook2 size={18} className={styles.walkthroughIcon} />
                  <Text className={styles.walkthroughTitle}>3. Export final codebook</Text>
                </Group>
                <Text className={styles.walkthroughText}>
                  Export the updated rules and labels for downstream dataset annotation tasks.
                </Text>
                <div className={styles.mockPanel}>
                  <Group gap={8}>
                    <IconChecklist size={15} className={styles.exampleIcon} />
                    <Text className={styles.exampleLabel}>codebook_v3.json ready</Text>
                  </Group>
                  <Group gap={6}>
                    <span className={styles.summaryChip}>14 labels</span>
                    <span className={styles.summaryChip}>36 rules</span>
                    <span className={styles.summaryChip}>updated today</span>
                  </Group>
                  <div className={styles.exportButtonMock}>Export Codebook</div>
                </div>
              </Stack>
            </Paper>
          </div>
        </Paper>
      </Container>

      <Container fluid className={styles.flowSection}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
          <Paper className={styles.walkthroughSection}>
            <Title order={4} className={styles.sectionTitle}>
              Work with us
            </Title>
            <Text className={styles.sectionHint} mt={4}>
              Are you a community organization interested in working with us? Send
              us a message.
            </Text>
            <Textarea
              mt="sm"
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

          <Paper className={styles.walkthroughSection}>
            <Title order={4} className={styles.sectionTitle}>
              Share your feedback
            </Title>
            <Text className={styles.sectionHint} mt={4}>
              Did you try out our tool? We'd love to hear from you — tell us how we
              can improve and what you'd like to see next.
            </Text>
            <Textarea
              mt="sm"
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
        </SimpleGrid>
        <Text ta="center" size="sm" c="dimmed" mt="md" mb="lg">
          Or email us directly at{" "}
          <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>.
        </Text>
      </Container>
    </Box>
  );
}
