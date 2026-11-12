# Shared remote state so more than one deployer can safely run `terraform
# apply` (via deploy.sh) without clobbering each other's local state.
#
# Bucket + lock table are created once (not managed by this config, to avoid
# a chicken-and-egg bootstrap problem): see docs/deploy-aws.md for how they
# were provisioned. Every deployer needs IAM permissions on both plus the
# usual EC2/IAM/SSM permissions to run terraform apply.
terraform {
  backend "s3" {
    bucket         = "annotation-tool-tfstate-702238571493"
    key            = "annotation-tool/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "annotation-tool-tf-lock"
    encrypt        = true
  }
}
