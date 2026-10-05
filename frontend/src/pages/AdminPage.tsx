import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { AdminUserView } from "@common/types/accounts";
import { createUser, listUsers, updateUser } from "../services/admin.service";
import { toast } from "../lib/toast";

function errMsg(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (data?.message) return data.message;
  if (data?.errors) {
    const first = Object.values(data.errors).flat().filter(Boolean)[0];
    if (first) return String(first);
  }
  return e?.message || fallback;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);

  // create form
  const [nu, setNu] = useState({ username: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);

  // edit modal
  const [editing, setEditing] = useState<AdminUserView | null>(null);
  const [ef, setEf] = useState({ username: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      setUsers(await listUsers());
    } catch (e) {
      toast.error(errMsg(e, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createUser(nu);
      toast.success(`Created ${nu.email}`);
      setNu({ username: "", email: "", password: "" });
      await refresh();
    } catch (e) {
      toast.error(errMsg(e, "Failed to create user"));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u: AdminUserView) => {
    setEditing(u);
    setEf({ username: u.username, email: u.email, password: "" });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (ef.username !== editing.username) payload.username = ef.username;
      if (ef.email !== editing.email) payload.email = ef.email;
      if (ef.password.trim().length > 0) payload.password = ef.password;
      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save");
      } else {
        await updateUser(editing.id, payload);
        toast.success("User updated");
        await refresh();
      }
      setEditing(null);
    } catch (e) {
      toast.error(errMsg(e, "Failed to update user"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: AdminUserView) => {
    try {
      await updateUser(u.id, { active: !u.active });
      toast.success(u.active ? `Deactivated ${u.email}` : `Activated ${u.email}`);
      await refresh();
    } catch (e) {
      toast.error(errMsg(e, "Failed to update status"));
    }
  };

  const createDisabled =
    creating || !nu.username.trim() || !nu.email.trim() || !nu.password.trim();

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>User Administration</Title>
        <Button variant="subtle" onClick={() => navigate("/home")}>
          Back to app
        </Button>
      </Group>

      <Paper withBorder p="md" mb="lg" radius="md">
        <Title order={4} mb="xs">
          Create account
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Password needs 8+ chars with upper, lower, number, and a special character.
        </Text>
        <Group align="flex-end" wrap="wrap">
          <TextInput
            label="Name"
            placeholder="Jane Doe"
            value={nu.username}
            onChange={(e) => setNu({ ...nu, username: e.currentTarget.value })}
          />
          <TextInput
            label="Email"
            placeholder="jane@example.org"
            value={nu.email}
            onChange={(e) => setNu({ ...nu, email: e.currentTarget.value })}
          />
          <PasswordInput
            label="Password"
            value={nu.password}
            onChange={(e) => setNu({ ...nu, password: e.currentTarget.value })}
          />
          <Button onClick={handleCreate} loading={creating} disabled={createDisabled}>
            Create user
          </Button>
        </Group>
      </Paper>

      <Title order={4} mb="xs">
        Accounts
      </Title>
      {loading ? (
        <Loader />
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.username}</Table.Td>
                <Table.Td>{u.email}</Table.Td>
                <Table.Td>
                  {u.isAdmin ? (
                    <Badge color="grape">Admin</Badge>
                  ) : u.active ? (
                    <Badge color="green">Active</Badge>
                  ) : (
                    <Badge color="gray">Deactivated</Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  {u.isAdmin ? (
                    <Text size="sm" c="dimmed">
                      Not editable
                    </Text>
                  ) : (
                    <Group gap="xs">
                      <Button size="xs" variant="light" onClick={() => openEdit(u)}>
                        Manage
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color={u.active ? "red" : "green"}
                        onClick={() => toggleActive(u)}
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </Button>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={`Manage ${editing?.email ?? ""}`}
      >
        <Stack>
          <TextInput
            label="Name"
            value={ef.username}
            onChange={(e) => setEf({ ...ef, username: e.currentTarget.value })}
          />
          <TextInput
            label="Email"
            value={ef.email}
            onChange={(e) => setEf({ ...ef, email: e.currentTarget.value })}
          />
          <PasswordInput
            label="New password"
            placeholder="Leave blank to keep current"
            value={ef.password}
            onChange={(e) => setEf({ ...ef, password: e.currentTarget.value })}
          />
          <Alert color="gray" variant="light">
            Changing the email changes the login for this user.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save changes
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
