# Terraform — annotation tool infra (AWS EC2)

Provisions everything the single-VM deploy needs, portably across AWS accounts:
security group, EC2 `t3.medium` + gp3 disk, Elastic IP, IAM instance role
(Bedrock-ready), key pair, and first-boot Docker/swap/data-dir setup.

It stops at infra + Docker. The app deploy (clone the private repo, fill `.env`,
`docker compose up`) stays manual because of the private repo + secrets — see
`../../docs/deploy-aws.md`. Full hands-off (secrets in SSM + images in ECR) is a later phase.

## Prerequisites
- Terraform >= 1.5, AWS CLI.
- AWS credentials configured (`aws configure`) with rights to create EC2/EIP/IAM/SG.
- An SSH key pair locally (`ssh-keygen -t ed25519` if you don't have one).

## Use
```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: set ssh_cidr to "$(curl -s ifconfig.me)/32"
terraform init
terraform apply
```

On success it prints `app_url`, `ssh_command`, and `next_steps`. Follow those
(add the deploy key to GitHub, allow-list the IP in Atlas, clone + `.env` + compose).

## Redeploy in another account
```bash
AWS_PROFILE=other terraform apply       # or set region/vars per account
```
Use a separate state (workspace or backend) per account/env.

## Teardown
```bash
terraform destroy
```
Destroys the instance, EIP, SG, IAM role, and key pair. **Uploads on the root
volume are lost** — snapshot `/mnt/appdata` first if you need the data.

## Variables (see variables.tf)
| var | default | notes |
|-----|---------|-------|
| `region` | us-east-1 | |
| `instance_type` | t3.medium | 4GB; t3.small once purely on APIs |
| `ssh_cidr` | 0.0.0.0/0 | **restrict to your IP/32** |
| `public_key_path` | ~/.ssh/id_ed25519.pub | installed for `ubuntu` login |
| `enable_bedrock` | false | true adds `bedrock:InvokeModel` to the instance role |
| `root_volume_gb` | 30 | |
| `ami_id` | "" (auto) | override the Ubuntu 24.04 image |
