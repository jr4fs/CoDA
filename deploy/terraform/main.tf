# Provisions the single-VM stack for the annotation tool on AWS EC2.
# Portable across accounts: set a different AWS profile/region + tfvars and re-apply.
#
#   terraform init
#   terraform apply -var 'ssh_cidr=<your.ip>/32'
#
# Outputs the sslip.io URL to point the browser at once `docker compose up` runs.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# Latest Canonical Ubuntu 24.04 (Noble) amd64 image.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd*/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "this" {
  key_name   = "${var.project}-key"
  public_key = file(pathexpand(var.public_key_path))
}

resource "aws_security_group" "this" {
  name_prefix = "${var.project}-"
  description = "annotation tool: ssh (restricted) + http/https (public)"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }
  ingress {
    description = "HTTP (ACME challenge + redirect)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Project = var.project }
}

# --- IAM instance role (empty by default; flip enable_bedrock for the Bedrock phase) ---
resource "aws_iam_role" "this" {
  name = "${var.project}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
  tags = { Project = var.project }
}

resource "aws_iam_role_policy" "bedrock" {
  count = var.enable_bedrock ? 1 : 0
  name  = "${var.project}-bedrock-invoke"
  role  = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = "*"
    }]
  })
}

# Lets the Docker awslogs driver ship container logs to CloudWatch (persist across
# redeploys). Scoped to this project's log groups. CloudWatch Logs free tier (5GB
# ingest + 5GB storage/mo) covers this app's volume.
resource "aws_iam_role_policy" "cloudwatch_logs" {
  name = "${var.project}-cloudwatch-logs"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams",
      ]
      Resource = "arn:aws:logs:*:*:log-group:/${var.project}/*"
    }]
  })
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.project}-profile"
  role = aws_iam_role.this.name
}

resource "aws_instance" "this" {
  ami                    = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.this.id]
  iam_instance_profile   = aws_iam_instance_profile.this.name
  user_data              = file("${path.module}/user_data.sh")

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = var.project, Project = var.project }
}

resource "aws_eip" "this" {
  domain   = "vpc"
  instance = aws_instance.this.id
  tags     = { Project = var.project }
}
