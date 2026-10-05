variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name/tag prefix for all resources."
  type        = string
  default     = "annotation-tool"
}

variable "instance_type" {
  description = "EC2 instance type. t3.medium (4GB) supports build + local mode; t3.small once purely on APIs."
  type        = string
  default     = "t3.medium"
}

variable "root_volume_gb" {
  description = "Root gp3 volume size in GB (holds /mnt/appdata uploads + images)."
  type        = number
  default     = 30
}

variable "ssh_cidr" {
  description = "CIDR allowed to SSH (port 22). Set to <your-public-ip>/32. Defaults open — restrict it."
  type        = string
  default     = "0.0.0.0/0"
}

variable "public_key_path" {
  description = "Path to the SSH public key to install for the 'ubuntu' login."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "enable_bedrock" {
  description = "Attach a bedrock:InvokeModel policy to the instance role (for the Bedrock phase)."
  type        = bool
  default     = false
}

variable "ami_id" {
  description = "Override the Ubuntu 24.04 AMI. Empty = latest Canonical image auto-selected."
  type        = string
  default     = ""
}
